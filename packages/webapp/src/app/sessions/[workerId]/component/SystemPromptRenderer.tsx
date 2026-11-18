import React, { useState } from 'react';
import { FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

type SystemPromptRendererProps = {
  systemPrompt: string;
  agentName?: string;
};

export const SystemPromptRenderer = ({ systemPrompt, agentName }: SystemPromptRendererProps) => {
  const t = useTranslations('sessions');
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-md min-w-0">
      <div className="flex items-start gap-2 min-w-0">
        <button onClick={() => setIsExpanded(!isExpanded)} className="flex-shrink-0 mt-0.5">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-start text-left text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer hover:underline min-w-0"
        >
          <span className="mt-0.5 flex-shrink-0 mr-2">
            <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </span>
          <span className="min-w-0 break-words">
            {agentName ? t('systemPromptFor', { agentName }) : t('systemPrompt')}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="mt-2 ml-6">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded overflow-auto max-h-96">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all font-mono">
              {systemPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
