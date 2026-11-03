'use client';

import { toast } from 'sonner';
import { useOptimisticAction } from 'next-safe-action/hooks';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import {
  updateGlobalPreferences,
  updateUserPreferencesAction,
  getUserPreferencesAction,
} from '../actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrashIcon } from 'lucide-react';
import AgentIconUploader from '@/components/AgentIconUploader';
import {
  GlobalPreferences,
  InferenceMode,
  ModelType,
  getAvailableModelTypes,
  modelConfigs,
} from '@remote-swe-agents/agent-core/schema';
import { useState, useEffect } from 'react';

interface GlobalPreferencesFormProps {
  preference: GlobalPreferences;
}

// Map internal inference mode identifiers to i18n translation keys.
const inferenceModeI18nKey: Partial<Record<InferenceMode, string>> = {
  bedrock: 'bedrock',
};

export default function GlobalPreferencesForm({ preference }: GlobalPreferencesFormProps) {
  const t = useTranslations('preferences');
  const [currentPreference, setCurrentPreference] = useState<GlobalPreferences>(preference);
  const [agentName, setAgentName] = useState(preference.defaultAgentName || '');

  // Per-user settings. `savedMode` is the server-authoritative default
  // inference mode for new sessions.
  const [savedMode, setSavedMode] = useState<InferenceMode>('bedrock');

  // Global preferences optimistic action
  const { execute, optimisticState, isPending } = useOptimisticAction(updateGlobalPreferences, {
    currentState: {
      modelOverride: currentPreference.modelOverride,
      enableLinkInPr: currentPreference.enableLinkInPr,
      defaultAgentName: currentPreference.defaultAgentName,
      defaultAgentIconKey: currentPreference.defaultAgentIconKey,
    },
    updateFn: (state, input) => ({
      modelOverride: input.modelOverride || state.modelOverride,
      enableLinkInPr: input.enableLinkInPr ?? state.enableLinkInPr,
      defaultAgentName: input.defaultAgentName ?? state.defaultAgentName,
      defaultAgentIconKey: input.defaultAgentIconKey ?? state.defaultAgentIconKey,
    }),
    onSuccess: ({ data }) => {
      toast.success(t('updateSuccess'));
      setCurrentPreference(data);
    },
    onError: () => toast.error(t('updateError')),
  });

  // Per-user preferences fetcher — used as the source of truth after mutations.
  const { execute: execGetUserPrefs } = useAction(getUserPreferencesAction, {
    onSuccess: ({ data }) => {
      if (data) {
        if (data.inferenceMode) setSavedMode(data.inferenceMode);
      }
    },
  });

  // Optimistic mode switch with rollback via refetch on error.
  const {
    execute: execUpdateMode,
    optimisticState: optimisticMode,
    isPending: isUpdatingMode,
  } = useOptimisticAction(updateUserPreferencesAction, {
    currentState: { mode: savedMode },
    updateFn: (_state, input) => ({ mode: (input.inferenceMode ?? _state.mode) as InferenceMode }),
    onSuccess: ({ input }) => {
      if (input.inferenceMode) setSavedMode(input.inferenceMode);
      toast.success(t('inferenceModeUpdateSuccess'));
    },
    onError: () => {
      toast.error(t('inferenceModeUpdateError'));
      // Rollback local state from server.
      execGetUserPrefs({});
    },
  });

  useEffect(() => {
    execGetUserPrefs({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectedMode = optimisticMode.mode;

  // Mode switching and API key save/delete are independent actions by design.
  // We intentionally allow switching to Kiro before an API key is
  // configured so the user can pick the mode first and then enter the key in
  // the section that appears below.
  const handleSelectMode = (mode: InferenceMode) => {
    if (mode === selectedMode) return;
    execUpdateMode({ inferenceMode: mode });
  };

  // Note: Only 'bedrock' mode is supported
  const availableModes: InferenceMode[] = ['bedrock'];

  return (
    <div className="space-y-6">
      {/* Default Agent Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('defaultAgentName')}
        </label>
        <div className="flex gap-2">
          <Input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder={t('defaultAgentNamePlaceholder')}
            disabled={isPending}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => execute({ defaultAgentName: agentName })}
            disabled={isPending || agentName === (currentPreference.defaultAgentName || '')}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
          >
            {t('save')}
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('defaultAgentNameDescription')}</p>
      </div>

      {/* Default Agent Icon */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('defaultAgentIcon')}
        </label>
        <AgentIconUploader
          currentIconKey={currentPreference.defaultAgentIconKey || undefined}
          onIconKeyChange={(key) => execute({ defaultAgentIconKey: key })}
          disabled={isPending}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('defaultAgentIconDescription')}</p>
      </div>

      {/* Default Inference Mode — Segment Control.
          This is the user-level default used as the initial value when
          creating new sessions. */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('inferenceMode')}</label>
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-100 dark:bg-gray-800">
          {availableModes.map((mode) => {
            const isActive = selectedMode === mode;
            const isDisabled = isUpdatingMode;
            return (
              <button
                key={mode}
                type="button"
                disabled={isDisabled}
                onClick={() => handleSelectMode(mode)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                } ${isDisabled && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {t(`inferenceModes.${inferenceModeI18nKey[mode]}`)}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('inferenceModeDescription')}</p>
      </div>

      {/* Bedrock Model */}
      {
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('defaultModel')}</label>
          <Select
            defaultValue={optimisticState.modelOverride}
            onValueChange={(value: ModelType) => execute({ modelOverride: value })}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {getAvailableModelTypes().map((type) => (
                <SelectItem key={type} value={type}>
                  {modelConfigs[type].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('defaultModelDescription')}</p>
        </div>

      <div>
        <div className="flex items-center space-x-3">
          <Checkbox
            id="enableLinkInPr"
            checked={optimisticState.enableLinkInPr}
            onCheckedChange={(checked) => execute({ enableLinkInPr: !!checked })}
            disabled={isPending}
          />
          <label htmlFor="enableLinkInPr" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('enableLinkInPr')}
          </label>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('enableLinkInPrDescription')}</p>
      </div>
    </div>
  );
}
