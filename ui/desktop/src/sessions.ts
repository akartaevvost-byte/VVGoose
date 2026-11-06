import type { Session } from './types/session';
import type { ExtensionConfig } from './types/extensions';
import type { GooseExtension } from '@aaif/goose-acp-client';
import type { setViewType } from './hooks/useNavigation';
import type { FixedExtensionEntry } from './components/ConfigContext';
import { AppEvents } from './constants/events';
import { acpChatSessionController } from './acp/chatSessionController';
import { getConfiguredGooseExtensions, gooseExtensionName } from './acp/extensions';
import { beginConfiguredRecipeParameterScope } from './acp/recipeParamRequests';
import { getAcpFeatureCapabilities } from './acp/capabilities';
import { RecipeDeclinedError, RecipeParameterScopesUnsupportedError } from './acp/errors';
import { decodeRecipe } from './acp/recipe';
import { scanRecipe, type Recipe } from './recipe';
import { listSavedRecipes } from './recipe/recipe_management';
import { requestRecipeConsent } from './recipe/consent';
import { acpReadDefaults, acpSetSessionProviderModel } from './acp/providers';
import { acpChatSessionActions } from './acp/chatSessionStore';

export function getSessionDisplayName(session: Session): string {
  if (session.user_set_name) {
    return session.name;
  }
  if (session.recipe?.title) {
    return session.recipe.title;
  }
  return session.name;
}

export interface CreateSessionOptions {
  recipeDeeplink?: string;
  recipeId?: string;
  extensionConfigs?: ExtensionConfig[];
  allExtensions?: FixedExtensionEntry[];
  provider?: string;
  model?: string;
}

/**
 * Three-valued on purpose. `undefined` means the caller is not naming a set and the
 * backend should use the configured one; `[]` means the user asked for a session with
 * no extensions at all. Collapsing the two is what made an all-off selection come back
 * with the default extensions.
 */
function selectedExtensionConfigs(options?: CreateSessionOptions): ExtensionConfig[] | undefined {
  if (options?.extensionConfigs) {
    return options.extensionConfigs;
  }
  if (options?.allExtensions) {
    const enabled = options.allExtensions
      .filter((extension) => extension.enabled)
      .map((extension) => {
        const { enabled: _enabled, ...config } = extension;
        return config as ExtensionConfig;
      });
    // An empty configured list is also what this looks like before the config
    // finishes loading, so it stays "not specified" rather than becoming an
    // explicit empty selection. Only `extensionConfigs` can express that.
    return enabled.length > 0 ? enabled : undefined;
  }
  return undefined;
}

async function resolveGooseExtensions(
  selected: ExtensionConfig[] | undefined
): Promise<GooseExtension[] | undefined> {
  if (selected === undefined) {
    return undefined;
  }
  if (selected.length === 0) {
    return [];
  }
  const selectedNames = new Set(selected.map((config) => config.name));
  return (await getConfiguredGooseExtensions())
    .filter((entry) => selectedNames.has(gooseExtensionName(entry.extension)))
    .map((entry) => entry.extension);
}

async function resolveRecipe(options?: CreateSessionOptions): Promise<Recipe | undefined> {
  if (options?.recipeId) {
    const entry = (await listSavedRecipes()).find((manifest) => manifest.id === options.recipeId);
    if (!entry) {
      throw new Error(`Recipe ${options.recipeId} was not found in the recipe library`);
    }
    return entry.recipe;
  }
  if (options?.recipeDeeplink) {
    return decodeRecipe(options.recipeDeeplink);
  }
  return undefined;
}

// Recipes can declare commands, endpoints, and shell checks that run as soon as the
// session exists, so consent has to be settled before session/new is ever sent.
async function ensureRecipeConsent(options?: CreateSessionOptions): Promise<void> {
  const recipe = await resolveRecipe(options);
  if (!recipe || (await window.electron.hasAcceptedRecipeBefore(recipe))) {
    return;
  }

  const scan = await scanRecipe(recipe);
  const accepted = await requestRecipeConsent({
    recipe,
    hasSecurityWarnings: scan.has_security_warnings,
  });
  if (!accepted) {
    throw new RecipeDeclinedError();
  }
  await window.electron.recordRecipeHash(recipe);
}

async function createAcpSession(
  workingDir: string,
  options?: CreateSessionOptions
): Promise<Session> {
  await ensureRecipeConsent(options);

  const configuredParameterScope = options?.recipeDeeplink
    ? beginConfiguredRecipeParameterScope()
    : undefined;
  try {
    if (configuredParameterScope) {
      const capabilities = await getAcpFeatureCapabilities();
      if (!capabilities.recipeParameterScopes) {
        throw new RecipeParameterScopesUnsupportedError();
      }
    }
    const gooseExtensions = await resolveGooseExtensions(selectedExtensionConfigs(options));
    const session = await acpChatSessionController.createSession(workingDir, gooseExtensions, {
      recipeId: options?.recipeId,
      recipeDeeplink: options?.recipeDeeplink,
      recipeParameterScopeId: configuredParameterScope?.id,
    });

    let targetProvider = options?.provider;
    let targetModel = options?.model;

    if (!targetProvider || !targetModel) {
      if (!options?.recipeId && !options?.recipeDeeplink) {
        try {
          if (window.electron?.getSetting) {
            const saved = await window.electron.getSetting('lastSelectedModelAndProvider');
            if (saved?.provider && saved?.model) {
              targetProvider = targetProvider ?? saved.provider;
              targetModel = targetModel ?? saved.model;
            }
          }
        } catch {
          // ignore
        }
        if (!targetProvider || !targetModel) {
          try {
            const defaults = await acpReadDefaults();
            targetProvider = targetProvider ?? defaults.providerId ?? undefined;
            targetModel = targetModel ?? defaults.modelId ?? undefined;
          } catch {
            // ignore
          }
        }
      }
    }

    if (
      targetProvider &&
      targetModel &&
      (session.provider_name !== targetProvider ||
        session.model_config?.model_name !== targetModel)
    ) {
      try {
        const applied = await acpSetSessionProviderModel(
          session.id,
          targetProvider,
          targetModel
        );
        session.provider_name = applied.providerId ?? targetProvider;
        if (session.model_config) {
          session.model_config.model_name = applied.modelId ?? targetModel;
        } else {
          session.model_config = {
            model_name: applied.modelId ?? targetModel,
            toolshim: false,
          };
        }
        acpChatSessionActions.setSessionMetadata(session.id, session);
      } catch (error) {
        console.error('Failed to set session provider and model on new session:', error);
      }
    }

    return session;
  } finally {
    configuredParameterScope?.finish();
  }
}

export async function createSession(
  workingDir: string,
  options?: CreateSessionOptions
): Promise<Session> {
  return createAcpSession(workingDir, options);
}

export async function startNewSession(
  initialText: string | undefined,
  setView: setViewType,
  workingDir: string,
  options?: CreateSessionOptions
): Promise<Session> {
  const session = await createSession(workingDir, options);
  window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED, { detail: { session } }));

  const initialMessage = initialText ? { msg: initialText, images: [] } : undefined;

  const eventDetail = {
    sessionId: session.id,
    initialMessage,
  };

  window.dispatchEvent(
    new CustomEvent(AppEvents.ADD_ACTIVE_SESSION, {
      detail: eventDetail,
    })
  );

  setView('pair', {
    disableAnimation: true,
    initialMessage,
    resumeSessionId: session.id,
  });
  return session;
}
