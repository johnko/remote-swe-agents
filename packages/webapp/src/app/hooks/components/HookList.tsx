'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { MAX_HOOK_CONTENT_LENGTH, MAX_HOOK_CATEGORY_LENGTH } from '@remote-swe-agents/agent-core/schema';
import { deleteUserHook, updateUserHook, type ClientHook } from '@/actions/hook/action';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import LocalDateTime from '@/components/LocalDateTime';

type HookListProps = {
  initialHooks: ClientHook[];
};

export default function HookList({ initialHooks }: HookListProps) {
  const t = useTranslations('hooks');
  const [hooks, setHooks] = useState(initialHooks);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Sync freshly fetched server data (e.g. after HookCreateForm calls
  // router.refresh() on create) into local state. Without this, the useState
  // initializer snapshot keeps the list stale until a full page reload.
  useEffect(() => {
    setHooks(initialHooks);
  }, [initialHooks]);

  if (hooks.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">{t('noHooks')}</p>;
  }

  const startEdit = (hook: ClientHook) => {
    setEditingId(hook.SK);
    setEditContent(hook.content);
    setEditCategory(hook.category ?? '');
    setExpandedId(hook.SK);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditCategory('');
  };

  const handleSaveEdit = async (hook: ClientHook) => {
    setBusyId(hook.SK);
    try {
      // Only send fields that actually changed. Sending unchanged content would
      // trigger a needless re-process (extra computation) and, on a transient
      // failure, REMOVE the existing hook.
      const result = await updateUserHook({
        hookId: hook.SK,
        ...(editContent !== hook.content ? { content: editContent } : {}),
        ...(editCategory !== (hook.category ?? '') ? { category: editCategory } : {}),
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
    const nextStatus = (hook.status ?? 'active') === 'active' ? 'archived' : 'active';
    setBusyId(hook.SK);
    try {
      const result = await updateUserHook({ hookId: hook.SK, status: nextStatus });
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
        const isActive = (hook.status ?? 'active') === 'active';
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
                    {isActive ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        {t('status.active')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                        {t('status.archived')}
                      </span>
                    )}
                    {hook.category && (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        {hook.category}
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                      {t(`createdBy.${hook.createdBy ?? 'agent'}`)}                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 truncate">{hook.content}</p>
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
                        {t('fields.content')}
                      </label>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        disabled={busyId === hook.SK}
                        maxLength={MAX_HOOK_CONTENT_LENGTH}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                        {editContent.length} / {MAX_HOOK_CONTENT_LENGTH}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('fields.category')}
                      </label>
                      <Input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        placeholder={t('categoryPlaceholder')}
                        disabled={busyId === hook.SK}
                        maxLength={MAX_HOOK_CATEGORY_LENGTH}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={cancelEdit} disabled={busyId === hook.SK}>
                        {t('cancel')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleSaveEdit(hook)}
                        disabled={busyId === hook.SK || editContent.trim().length === 0}
                      >
                        {t('save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {hook.content}
                    </p>
                    <div className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
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
                        {isActive ? t('disable') : t('enable')}
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
