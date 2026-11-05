import { useContext, useEffect } from 'react';
import type { ActionRequired } from '../types/message';
import { defineMessages, useIntl } from '../i18n';
import { snakeToTitleCase } from '../utils';
import ToolApprovalButtons from './ToolApprovalButtons';
import { ToolCallArguments, type ToolCallArgumentValue } from './ToolCallArguments';
import { WorkspaceContext } from '../contexts/WorkspaceContext';
import { GitCompare } from 'lucide-react';

const i18n = defineMessages({
  allowToolCallWithName: {
    id: 'toolConfirmation.allowToolCallWithName',
    defaultMessage: 'Allow {toolName}?',
  },
  gooseWouldLikeToCallWithName: {
    id: 'toolConfirmation.gooseWouldLikeToCallWithName',
    defaultMessage: 'Goose would like to call {toolName}. Allow?',
  },
  openDiffInEditor: {
    id: 'toolConfirmation.openDiffInEditor',
    defaultMessage: 'Open diff in editor',
  },
});

function formatToolName(fullName: string): string {
  const delimiterIndex = fullName.lastIndexOf('__');
  const shortName = delimiterIndex === -1 ? fullName : fullName.substring(delimiterIndex + 2);
  return snakeToTitleCase(shortName);
}

type ToolConfirmationData = Extract<ActionRequired['data'], { actionType: 'toolConfirmation' }>;

interface ToolConfirmationProps {
  sessionId: string;
  isClicked: boolean;
  actionRequiredContent: ActionRequired & { type: 'actionRequired' };
}

export default function ToolConfirmation({
  sessionId,
  isClicked,
  actionRequiredContent,
}: ToolConfirmationProps) {
  const intl = useIntl();
  const workspace = useContext(WorkspaceContext);
  const data = actionRequiredContent.data as ToolConfirmationData;
  const { generation, id, toolName, arguments: toolArguments, prompt } = data;
  const displayName = formatToolName(toolName);

  const isFileTool =
    toolName.includes('write') ||
    toolName.includes('edit') ||
    toolName.includes('patch') ||
    toolName.includes('text_editor');
  const filePath = (toolArguments?.path as string | undefined) || undefined;

  useEffect(() => {
    if (isFileTool && filePath && workspace?.proposeDiff && !isClicked) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      const proposedContent = (toolArguments?.content as string) || '';
      const beforeText = (toolArguments?.before as string) || undefined;
      const afterText = (toolArguments?.after as string) || undefined;

      void workspace.proposeDiff({
        id,
        filePath,
        fileName,
        originalContent: '',
        proposedContent,
        beforeText,
        afterText,
        toolApprovalData: {
          sessionId,
          id,
          generation: generation ?? undefined,
        },
      });
    }
  }, [isFileTool, filePath, id, generation, sessionId, isClicked, toolArguments, workspace]);

  const handleOpenDiffInEditor = () => {
    if (!workspace?.proposeDiff || !filePath) return;
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const proposedContent = (toolArguments?.content as string) || '';
    const beforeText = (toolArguments?.before as string) || undefined;
    const afterText = (toolArguments?.after as string) || undefined;

    void workspace.proposeDiff({
      id,
      filePath,
      fileName,
      originalContent: '',
      proposedContent,
      beforeText,
      afterText,
      toolApprovalData: {
        sessionId,
        id,
        generation: generation ?? undefined,
      },
    });
  };

  return (
    <div className="goose-message-content bg-background-primary border border-border-primary rounded-2xl overflow-hidden">
      <div className="bg-background-secondary px-4 py-2 text-text-primary">
        {prompt
          ? intl.formatMessage(i18n.allowToolCallWithName, { toolName: displayName })
          : intl.formatMessage(i18n.gooseWouldLikeToCallWithName, { toolName: displayName })}
      </div>
      <div className="px-4 pb-2">
        {prompt && <div className="py-2 text-sm text-amber-600 dark:text-amber-400">{prompt}</div>}
        <ToolCallArguments args={toolArguments as Record<string, ToolCallArgumentValue>} />

        {isFileTool && filePath && (
          <button
            type="button"
            onClick={handleOpenDiffInEditor}
            className="flex items-center gap-1.5 px-3 py-1 text-xs text-goose-teal hover:bg-goose-teal/10 rounded-md border border-goose-teal/40 transition-colors my-2 cursor-pointer"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Открыть сравнение в редакторе</span>
          </button>
        )}

        <ToolApprovalButtons
          data={{ generation, id, toolName, prompt: prompt ?? undefined, sessionId, isClicked }}
        />
      </div>
    </div>
  );
}
