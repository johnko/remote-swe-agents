'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  MAX_HOOK_NAME_LENGTH,
  MAX_HOOK_DESCRIPTION_LENGTH,
  MAX_HOOK_COMMAND_LENGTH,
  MAX_HOOK_SCRIPT_LENGTH,
  hookEventTypeSchema,
} from '@remote-swe-agents/agent-core/schema';
import { createUserHook } from '@/actions/hook/action';

const eventTypes = hookEventTypeSchema.options;

export default function HookCreateForm() {
  const t = useTranslations('hooks');
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [event, setEvent] = useState(eventTypes[0]);
  const [command, setCommand] = useState('');
  const [script, setScript] = useState('');
  const [isActive, setIsActive] = useState(true);

  const { execute, isPending } = useAction(createUserHook, {
    onSuccess: () => {
      toast.success(t('createSuccess'));
      setName('');
      setDescription('');
      setEvent(eventTypes[0]);
      setCommand('');
      setScript('');
      setIsActive(true);
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t('createError'));
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('fields.name')}</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          disabled={isPending}
          maxLength={MAX_HOOK_NAME_LENGTH}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('fields.description')}
        </label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('descriptionPlaceholder')}
          disabled={isPending}
          maxLength={MAX_HOOK_DESCRIPTION_LENGTH}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('fields.event')}</label>
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value as typeof event)}
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {eventTypes.map((evt) => (
            <option key={evt} value={evt}>
              {evt}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('fields.command')}
        </label>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('commandPlaceholder')}
          disabled={isPending}
          maxLength={MAX_HOOK_COMMAND_LENGTH}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('commandHelp')}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('fields.script')}</label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={t('scriptPlaceholder')}
          disabled={isPending}
          maxLength={MAX_HOOK_SCRIPT_LENGTH}
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
          {script.length} / {MAX_HOOK_SCRIPT_LENGTH}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
          {t('fields.isActive')}
        </label>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() =>
            execute({
              name,
              description: description || undefined,
              event,
              command,
              script: script || undefined,
              isActive,
            })
          }
          disabled={isPending || name.trim().length === 0 || command.trim().length === 0}
        >
          {isPending ? t('creating') : t('create.button')}
        </Button>
      </div>
    </div>
  );
}
