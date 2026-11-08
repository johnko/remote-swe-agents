'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import {
  MAX_HOOK_NAME_LENGTH,
  MAX_HOOK_DESCRIPTION_LENGTH,
  MAX_HOOK_COMMAND_LENGTH,
  MAX_HOOK_SCRIPT_LENGTH,
  hookEventTypeSchema,
} from '@remote-swe-agents/agent-core/schema';
import { deleteUserHook, updateUserHook, type ClientHook } from '@/actions/hook/action';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import LocalDateTime from '@/components/LocalDateTime';
import { getHookRuntimes, getRuntimeBadgeColor } from '@/lib/hook-runtime-map';

type HookListProps = {
  initialHooks: ClientHook[];
};

const eventTypes = hookEventTypeSchema.options;

export default function HookList({ initialHooks }: HookListProps) {
  const t = useTranslations('hooks');
  const [hooks, setHooks] = useState(initialHooks);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEvent, setEditEvent] = useState(eventTypes[0]);
  const [editCommand, setEditCommand] = useState('');
  const [editScript, setEditScript] = useState('');
  const [editIsEnabled, setEditIsActive] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setHooks(initialHooks);
  }, [initialHooks]);

  if (hooks.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">{t('noHooks')}</p>;
  }

  const startEdit = (hook: ClientHook) => {
    setEditingId(hook.SK);
    setEditName(hook.name);
    setEditDescription(hook.description ?? '');
    setEditEvent(hook.event);
    setEditCommand(hook.command);
    setEditScript(hook.script ?? '');
    setEditIsEnabled(hook.isEnabled ?? true);
    setExpandedId(hook.SK);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditEvent(eventTypes[0]);
    setEditCommand('');
    setEditScript('');
    setEditIsActive(true);
  };

  const handleSaveEdit = async (hook: ClientHook) => {
    setBusyId(hook.SK);
    try {
      const result = await updateUserHook({
        hookId: hook.SK,
        ...(editName !== hook.name ? { name: editName } : {}),
        ...(editDescription !== (hook.description ?? '') ? { description: editDescription } : {}),
        ...(editEvent !== hook.event ? { event: editEvent } : {}),
        ...(editCommand !== hook.command ? { command: editCommand } : {}),
        ...(editScript !== (hook.script ?? '') ? { script: editScript } : {}),
        ...(editIsEnabled !== (hook.isEnabled ?? true) ? { isEnabled: editIsEnabled } : {}),
      });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      if (result?.data) {
        const updated = result.data;
        setHooks((prev) => prev.map((h) => (h.SK === hook.SK ? updated : h)));
        toast.success(t('updateSuccess'));
        cancelEdit();
      }
    } catch {
      toast.error(t('updateError'));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleStatus = async (hook: ClientHook) => {
    const nextIsEnabled = !(hook.isEnabled ?? true);
    setBusyId(hook.SK);
    try {
      const result = await updateUserHook({ hookId: hook.SK, isEnabled: nextIsEnabled });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      if (result?.data) {
        const updated = result.data;
        setHooks((prev) => prev.map((h) => (h.SK === hook.SK ? updated : h)));
        toast.success(t('updateSuccess'));
      }
    } catch {
      toast.error(t('updateError'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (hook: ClientHook) => {
    if (!confirm(t('confirmDelete'))) return;
    setBusyId(hook.SK);
    try {
      const result = await deleteUserHook({ hookId: hook.SK });
      if (result?.data?.success) {
        setHooks((prev) => prev.filter((h) => h.SK !== hook.SK));
      }
    } catch {
      toast.error(t('deleteError'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {hooks.map((hook) => {
        const isEnabled = hook.isEnabled ?? false;
        const isEditing = editingId === hook.SK;
        return (
          <div
            key={hook.SK}
            className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            <div
              className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              onClick={() => setExpandedId(expandedId === hook.SK ? null : hook.SK)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isEnabled ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        {t('status.active')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                        {t('status.inactive')}
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                      {hook.event}
                    </span>
                    {getHookRuntimes(hook.event).map((runtime) => (
                      <span
                        key={runtime}
                        className={`px-2 py-0.5 text-xs rounded ${getRuntimeBadgeColor(runtime)}`}
                      >
                        {runtime === 'agentcore' ? 'Agent Core' : runtime.charAt(0).toUpperCase() + runtime.slice(1)}
                      </span>
                    ))}
                    <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                      {t(`createdBy.${hook.createdBy ?? 'user'}`)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">{hook.name}</p>
                  {hook.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hook.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    <LocalDateTime timestamp={hook.updatedAt} format="date" />
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(hook);
                    }}
                    disabled={busyId === hook.SK}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                    aria-label={t('edit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(hook);
                    }}
                    disabled={busyId === hook.SK}
                    className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                    aria-label={t('delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {expandedId === hook.SK ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                </div>
              </div>
            </div>
            {expandedId === hook.SK && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                {isEditing ? (
                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('fields.name')}
                      </label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={busyId === hook.SK}
                        maxLength={MAX_HOOK_NAME_LENGTH}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('fields.description')}
                      </label>
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        disabled={busyId === hook.SK}
                        maxLength={MAX_HOOK_DESCRIPTION_LENGTH}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('fields.event')}
                      </label>
                      <select
                        value={editEvent}
                        onChange={(e) => setEditEvent(e.target.value as typeof editEvent)}
                        disabled={busyId === hook.SK}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {eventTypes.map((evt) => {
                          const runtimes = getHookRuntimes(evt);
                          const runtimesLabel = runtimes
                            .map((r) => (r === 'agentcore' ? 'Agent Core' : r.charAt(0).toUpperCase() + r.slice(1)))
                            .join(', ');
                          return (
                            <option key={evt} value={evt}>
                              {evt} — {runtimesLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('fields.command')}
                      </label>
                      <Input
                        value={editCommand}
                        onChange={(e) => setEditCommand(e.target.value)}
                        disabled={busyId === hook.SK}
                        maxLength={MAX_HOOK_COMMAND_LENGTH}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('fields.script')}
                      </label>
                      <textarea
                        value={editScript}
                        onChange={(e) => setEditScript(e.target.value)}
                        disabled={busyId === hook.SK}
                        maxLength={MAX_HOOK_SCRIPT_LENGTH}
                        rows={8}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                        {editScript.length} / {MAX_HOOK_SCRIPT_LENGTH}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`isEnabled-${hook.SK}`}
                        checked={editIsEnabled}
                        onChange={(e) => setEditIsActive(e.target.checked)}
                        disabled={busyId === hook.SK}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor={`isEnabled-${hook.SK}`} className="text-sm text-gray-700 dark:text-gray-300">
                        {t('fields.isEnabled')}
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={cancelEdit} disabled={busyId === hook.SK}>
                        {t('cancel')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleSaveEdit(hook)}
                        disabled={busyId === hook.SK || editName.trim().length === 0 || editCommand.trim().length === 0}
                      >
                        {t('save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
                      <p>
                        <span className="font-medium">{t('fields.event')}:</span> {hook.event}
                      </p>
                      <p>
                        <span className="font-medium">{t('fields.command')}:</span>{' '}
                        <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{hook.command}</code>
                      </p>
                      {hook.script && (
                        <div>
                          <span className="font-medium">{t('fields.script')}:</span>
                          <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono overflow-x-auto">
                            {hook.script}
                          </pre>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <p>
                        <span className="font-medium">ID:</span> {hook.SK}
                      </p>
                      {hook.sourceSessionId && (
                        <p>
                          <span className="font-medium">{t('fields.sourceSession')}:</span> {hook.sourceSessionId}
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleToggleStatus(hook)}
                        disabled={busyId === hook.SK}
                      >
                        {hook.isEnabled ? t('disable') : t('enable')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
