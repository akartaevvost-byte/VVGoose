use anyhow::Result;
use async_trait::async_trait;
use futures::future::BoxFuture;
use goose_providers::cache_semantics::apply_chat_payload_breakpoints;
use goose_providers::conversation::token_usage::ProviderUsage;
use goose_providers::errors::ProviderError;
use goose_providers::images::ImageFormat;
use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, Instant};

use super::api_client::{ApiClient, AuthMethod};
use super::base::{
    ConfigKey, MessageStream, ModelInfo, Provider, ProviderDef, ProviderMetadata,
    DEFAULT_PROVIDER_TIMEOUT_SECS,
};
use super::openai_compatible::{
    handle_response_openai_compat, handle_status, stream_openai_compat,
};
use super::retry::ProviderRetry;
use super::utils::get_model;
use crate::conversation::message::Message;
use goose_providers::model::ModelConfig;
use goose_providers::request_log::{start_log, LoggerHandleExt};
use rmcp::model::Tool;

pub const RED_MAD_ROUTER_PROVIDER_NAME: &str = "red_mad_router";
pub const RED_MAD_ROUTER_DEFAULT_HOST: &str = "https://vvchat.vkusvill.ru/red-mad-router";
pub const RED_MAD_ROUTER_DEFAULT_MODEL: &str = "gpt-4o";
pub const RED_MAD_ROUTER_DOC_URL: &str = "https://vvchat.vkusvill.ru/red-mad-router";

pub const RED_MAD_ROUTER_KNOWN_MODELS: &[&str] = &[
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-sonnet-4.6",
    "deepseek-chat",
    "deepseek-reasoner",
    "gemini-2.0-flash",
];

const MODEL_INFO_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(5);
const MODEL_INFO_FAILURE_TTL: Duration = Duration::from_secs(60);

#[derive(Debug)]
enum CachedModelInfo {
    Success(Vec<ModelInfo>),
    Failure(Instant),
}

#[derive(Debug, serde::Serialize)]
pub struct RedMadRouterProvider {
    #[serde(skip)]
    api_client: ApiClient,
    base_path: String,
    supports_streaming: bool,
    #[serde(skip)]
    name: String,
    #[serde(skip)]
    cached_model_info: tokio::sync::Mutex<Option<CachedModelInfo>>,
}

impl RedMadRouterProvider {
    pub async fn from_env(
        tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> Result<Self> {
        let config = crate::config::Config::global();
        let secrets = config
            .get_secrets("RED_MAD_ROUTER_API_KEY", &["RED_MAD_ROUTER_CUSTOM_HEADERS"])
            .unwrap_or_default();
        let api_key = secrets
            .get("RED_MAD_ROUTER_API_KEY")
            .cloned()
            .unwrap_or_default();
        let host: String = config
            .get_param("RED_MAD_ROUTER_HOST")
            .unwrap_or_else(|_| RED_MAD_ROUTER_DEFAULT_HOST.to_string());
        let base_path: String = config
            .get_param("RED_MAD_ROUTER_BASE_PATH")
            .unwrap_or_else(|_| "v1/chat/completions".to_string());
        let custom_headers: Option<HashMap<String, String>> = secrets
            .get("RED_MAD_ROUTER_CUSTOM_HEADERS")
            .cloned()
            .map(parse_custom_headers);
        let timeout_secs: u64 = config
            .get_param("RED_MAD_ROUTER_TIMEOUT")
            .unwrap_or(DEFAULT_PROVIDER_TIMEOUT_SECS);
        let supports_streaming: bool = config
            .get_param("RED_MAD_ROUTER_SUPPORTS_STREAMING")
            .unwrap_or(true);

        let auth = if api_key.is_empty() {
            AuthMethod::NoAuth
        } else {
            AuthMethod::BearerToken(api_key.clone())
        };

        let mut api_client = ApiClient::with_timeout_and_tls(
            host,
            auth,
            std::time::Duration::from_secs(timeout_secs),
            tls_config,
        )?
        .with_request_builder(crate::session_context::session_id_request_builder())
        .with_header("X-Title", "VVGoose")?;

        if !api_key.is_empty() {
            api_client = api_client.with_header("x-litellm-api-key", &api_key)?;
        }

        if let Some(headers) = custom_headers {
            let mut header_map = reqwest::header::HeaderMap::new();
            for (key, value) in headers {
                let header_name = reqwest::header::HeaderName::from_bytes(key.as_bytes())?;
                let header_value = reqwest::header::HeaderValue::from_str(&value)?;
                header_map.insert(header_name, header_value);
            }
            api_client = api_client.with_headers(header_map)?;
        }

        Ok(Self {
            api_client,
            base_path,
            supports_streaming,
            name: RED_MAD_ROUTER_PROVIDER_NAME.to_string(),
            cached_model_info: tokio::sync::Mutex::new(None),
        })
    }

    async fn get_or_fetch_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let mut cache = self.cached_model_info.lock().await;
        match cache.as_ref() {
            Some(CachedModelInfo::Success(models)) => return Ok(models.clone()),
            Some(CachedModelInfo::Failure(fetched_at))
                if fetched_at.elapsed() < MODEL_INFO_FAILURE_TTL =>
            {
                return Err(ProviderError::RequestFailed(
                    "Red Mad Router model metadata is unavailable".to_string(),
                ));
            }
            Some(CachedModelInfo::Failure(_)) | None => {}
        }

        match tokio::time::timeout(MODEL_INFO_DISCOVERY_TIMEOUT, self.fetch_models_from_api()).await
        {
            Ok(Ok(models)) => {
                *cache = Some(CachedModelInfo::Success(models.clone()));
                Ok(models)
            }
            Ok(Err(error)) => {
                *cache = Some(CachedModelInfo::Failure(Instant::now()));
                Err(error)
            }
            Err(_) => {
                *cache = Some(CachedModelInfo::Failure(Instant::now()));
                Err(ProviderError::RequestFailed(
                    "Red Mad Router model metadata discovery timed out".to_string(),
                ))
            }
        }
    }

    async fn fetch_models_from_api(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        // First try rich metadata endpoint: /model/info
        if let Ok(response) = self.api_client.request("model/info").response_get().await {
            if response.status().is_success() {
                if let Ok(response_json) = response.json::<Value>().await {
                    if let Some(models_data) = response_json["data"].as_array() {
                        let mut models = Vec::new();
                        for model_data in models_data {
                            if let Some(model_name) = model_data["model_name"].as_str() {
                                if model_name.contains("/*") {
                                    continue;
                                }

                                let model_info = &model_data["model_info"];
                                let context_length = model_info["max_input_tokens"]
                                    .as_u64()
                                    .map(|limit| limit as usize);
                                let supports_cache_control =
                                    model_info["supports_prompt_caching"].as_bool();

                                let mut model_info_obj = ModelInfo::new(model_name)
                                    .with_optional_context_limit(context_length);
                                model_info_obj.supports_cache_control = supports_cache_control;
                                model_info_obj.supports_vision =
                                    model_info["supports_vision"].as_bool();
                                models.push(model_info_obj);
                            }
                        }
                        if !models.is_empty() {
                            return Ok(models);
                        }
                    }
                }
            }
        }

        // Fallback 1: try /v1/models (standard OpenAI models list)
        // Fallback 2: try /models
        for endpoint in ["v1/models", "models"] {
            if let Ok(response) = self.api_client.request(endpoint).response_get().await {
                if response.status().is_success() {
                    if let Ok(response_json) = response.json::<Value>().await {
                        if let Some(models_data) = response_json["data"].as_array() {
                            let mut models = Vec::new();
                            for model_data in models_data {
                                if let Some(model_id) = model_data["id"].as_str() {
                                    if model_id.contains("/*") {
                                        continue;
                                    }
                                    models.push(ModelInfo::new(model_id));
                                }
                            }
                            if !models.is_empty() {
                                return Ok(models);
                            }
                        }
                    }
                }
            }
        }

        // Fallback 3: Return known models if discovery was empty
        Ok(RED_MAD_ROUTER_KNOWN_MODELS
            .iter()
            .map(|name| ModelInfo::new(*name))
            .collect())
    }

    async fn post(
        &self,
        model_config: &ModelConfig,
        payload: &Value,
    ) -> Result<reqwest::Response, ProviderError> {
        Ok(self
            .api_client
            .request(&self.base_path)
            .model_headers(model_config)?
            .streaming(self.supports_streaming)
            .response_post(payload)
            .await?)
    }

    async fn model_info(&self, model_name: &str) -> Option<ModelInfo> {
        self.get_or_fetch_models()
            .await
            .ok()?
            .into_iter()
            .find(|m| m.name == model_name)
    }

    async fn supports_cache_control(&self, model: &ModelConfig) -> bool {
        if let Some(model_info) = self.model_info(&model.model_name).await {
            if let Some(supports_cache) = model_info.supports_cache_control {
                return supports_cache;
            }
        }
        goose_providers::cache_semantics::CacheSemantics::for_model(&self.name, &model.model_name)
            .uses_explicit_breakpoints()
    }
}

impl goose_providers::base::ProviderDescriptor for RedMadRouterProvider {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            RED_MAD_ROUTER_PROVIDER_NAME,
            "Red Mad Router",
            "ВкусВилл Red Mad Router — корпоративный шлюз LLM (LiteLLM proxy)",
            RED_MAD_ROUTER_DEFAULT_MODEL,
            RED_MAD_ROUTER_KNOWN_MODELS.to_vec(),
            RED_MAD_ROUTER_DOC_URL,
            vec![
                ConfigKey::new("RED_MAD_ROUTER_API_KEY", true, true, None, true),
                ConfigKey::new(
                    "RED_MAD_ROUTER_HOST",
                    false,
                    false,
                    Some(RED_MAD_ROUTER_DEFAULT_HOST),
                    false,
                ),
                ConfigKey::new(
                    "RED_MAD_ROUTER_BASE_PATH",
                    false,
                    false,
                    Some("v1/chat/completions"),
                    false,
                ),
                ConfigKey::new("RED_MAD_ROUTER_CUSTOM_HEADERS", false, true, None, false),
                ConfigKey::new("RED_MAD_ROUTER_TIMEOUT", false, false, Some("600"), false),
                ConfigKey::new(
                    "RED_MAD_ROUTER_SUPPORTS_STREAMING",
                    false,
                    false,
                    Some("true"),
                    false,
                ),
            ],
        )
        .with_setup(
            crate::providers::catalog::ProviderSetupMetadata::new(
                crate::providers::catalog::ProviderSetupCategory::Model,
                crate::providers::catalog::ProviderSetupMethod::ConfigFields,
                crate::providers::catalog::ProviderSetupGroup::Default,
            )
            .with_field(
                "RED_MAD_ROUTER_API_KEY",
                "API Key (sk-...)",
                Some("Вставьте ваш виртуальный ключ LiteLLM"),
                None,
            )
            .with_field(
                "RED_MAD_ROUTER_HOST",
                "Host URL",
                Some("https://vvchat.vkusvill.ru/red-mad-router"),
                None,
            ),
        )
    }
}

impl ProviderDef for RedMadRouterProvider {
    type Provider = Self;

    fn from_env(
        _extensions: Vec<crate::config::ExtensionConfig>,
        tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>> {
        Box::pin(Self::from_env(tls_config))
    }
}

#[async_trait]
impl Provider for RedMadRouterProvider {
    fn get_name(&self) -> &str {
        &self.name
    }

    async fn get_context_limit(&self, model: &str, override_limit: Option<usize>) -> usize {
        goose_providers::context_limit::ContextLimitResolver::new(&self.name)
            .resolve(model, override_limit, || async {
                Ok(self
                    .get_or_fetch_models()
                    .await?
                    .iter()
                    .find(|info| info.name == model)
                    .and_then(|info| info.context_limit))
            })
            .await
    }

    async fn stream(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        let mut effective_model_config = model_config.clone();
        if effective_model_config.supports_vision.is_none() {
            effective_model_config.supports_vision = self
                .model_info(&model_config.model_name)
                .await
                .and_then(|info| info.supports_vision);
        }

        let mut payload = goose_providers::formats::openai::create_request(
            &effective_model_config,
            system,
            messages,
            tools,
            &ImageFormat::OpenAi,
            self.supports_streaming,
        )?;

        if !model_config.prompt_cache_disabled() && self.supports_cache_control(model_config).await
        {
            apply_chat_payload_breakpoints(&mut payload);
        }

        let mut log = start_log(model_config, &payload)?;

        if self.supports_streaming {
            let response = self
                .with_retry(|| async {
                    let payload_clone = payload.clone();
                    let response = self.post(model_config, &payload_clone).await?;
                    handle_status(response).await
                })
                .await
                .inspect_err(|error| {
                    let _ = log.error(error);
                })?;

            return stream_openai_compat(response, log);
        }

        let response = self
            .with_retry(|| async {
                let payload_clone = payload.clone();
                let response = self.post(model_config, &payload_clone).await?;
                handle_response_openai_compat(response).await
            })
            .await
            .inspect_err(|error| {
                let _ = log.error(error);
            })?;

        let message = goose_providers::formats::openai::response_to_message(&response)?;
        let usage = goose_providers::formats::openai::get_usage(&response);
        let response_model = get_model(&response);
        log.write(&response, Some(&usage))?;
        let provider_usage = ProviderUsage::new(response_model, usage);
        Ok(super::base::stream_from_single_message(
            message,
            provider_usage,
        ))
    }

    fn skip_canonical_filtering(&self) -> bool {
        true
    }

    async fn fetch_supported_models(&self) -> Result<Vec<String>, ProviderError> {
        let models = self.get_or_fetch_models().await?;
        Ok(models.iter().map(|m| m.name.clone()).collect())
    }
}

fn parse_custom_headers(headers_str: String) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    for line in headers_str.lines() {
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    headers
}

#[cfg(test)]
mod tests {
    use super::*;
    use goose_providers::base::ProviderDescriptor;
    use serde_json::json;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn metadata_properties() {
        let metadata = RedMadRouterProvider::metadata();
        assert_eq!(metadata.name, "red_mad_router");
        assert_eq!(metadata.default_model, "gpt-4o");
        assert_eq!(
            metadata.model_doc_link,
            "https://vvchat.vkusvill.ru/red-mad-router"
        );
        assert!(metadata
            .config_keys
            .iter()
            .any(|k| k.name == "RED_MAD_ROUTER_API_KEY"));
        assert!(metadata
            .config_keys
            .iter()
            .any(|k| k.name == "RED_MAD_ROUTER_HOST"));
    }

    #[tokio::test]
    async fn fetch_models_from_model_info_endpoint() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/model/info"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": [
                    {
                        "model_name": "custom-gpt-4o",
                        "model_info": {
                            "max_input_tokens": 128000,
                            "supports_prompt_caching": true,
                            "supports_vision": true
                        }
                    },
                    {
                        "model_name": "wildcard/*",
                        "model_info": {}
                    }
                ]
            })))
            .mount(&server)
            .await;

        let provider = RedMadRouterProvider {
            api_client: ApiClient::new_with_tls(server.uri(), AuthMethod::NoAuth, None).unwrap(),
            base_path: "v1/chat/completions".to_string(),
            supports_streaming: true,
            name: RED_MAD_ROUTER_PROVIDER_NAME.to_string(),
            cached_model_info: tokio::sync::Mutex::new(None),
        };

        let models = provider.fetch_models_from_api().await.unwrap();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].name, "custom-gpt-4o");
        assert_eq!(models[0].context_limit, Some(128000));
        assert_eq!(models[0].supports_cache_control, Some(true));
        assert_eq!(models[0].supports_vision, Some(true));
    }

    #[tokio::test]
    async fn fetch_models_fallback_to_v1_models() {
        let server = MockServer::start().await;
        // /model/info returns 404
        Mock::given(method("GET"))
            .and(path("/model/info"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        // /v1/models returns standard list
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": [
                    { "id": "fallback-claude-3-7" },
                    { "id": "fallback-gpt-4o" }
                ]
            })))
            .mount(&server)
            .await;

        let provider = RedMadRouterProvider {
            api_client: ApiClient::new_with_tls(server.uri(), AuthMethod::NoAuth, None).unwrap(),
            base_path: "v1/chat/completions".to_string(),
            supports_streaming: true,
            name: RED_MAD_ROUTER_PROVIDER_NAME.to_string(),
            cached_model_info: tokio::sync::Mutex::new(None),
        };

        let models = provider.fetch_models_from_api().await.unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].name, "fallback-claude-3-7");
        assert_eq!(models[1].name, "fallback-gpt-4o");
    }

    #[tokio::test]
    async fn context_limit_uses_cached_model_info() {
        let cached_model_info =
            tokio::sync::Mutex::new(Some(CachedModelInfo::Success(vec![ModelInfo::new(
                "cached-rmr-model",
            )
            .with_context_limit(64_000)])));
        let provider = RedMadRouterProvider {
            api_client: ApiClient::new_with_tls(
                "http://127.0.0.1:1".to_string(),
                AuthMethod::NoAuth,
                None,
            )
            .unwrap(),
            base_path: "v1/chat/completions".to_string(),
            supports_streaming: true,
            name: RED_MAD_ROUTER_PROVIDER_NAME.to_string(),
            cached_model_info,
        };

        assert_eq!(
            provider.get_context_limit("cached-rmr-model", None).await,
            64_000
        );
    }
}
