'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations, useLocale } from 'next-intl';
import { createPromptTemplate, updatePromptTemplate, deletePromptTemplate } from './template-actions';
import { PromptTemplate } from '@/app/sessions/new/schemas';
import { formatDate } from '@/lib/utils';

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: PromptTemplate[];
  onSelectTemplate: (template: PromptTemplate) => void;
}

/**
 * State machine for template modal UI mode.
 * Replaces fragmented boolean flags (isCreating, editingId) with explicit,
 * mutually-exclusive states. Prevents impossible states like
 * (isCreating=true && editingId!=null) and enables exhaustive switch handling.
 */
type TemplateModalMode = { type: 'viewing' } | { type: 'creating' } | { type: 'editing'; templateId: string };

export default function TemplateModal({ isOpen, onClose, templates, onSelectTemplate }: TemplateModalProps) {
  const t = useTranslations('new_session.templateModal');
  const locale = useLocale();
  const localeForDate = locale === 'ja' ? 'ja-JP' : 'en-US';

  // Single state machine for modal mode
  const [mode, setMode] = useState<TemplateModalMode>({ type: 'viewing' });
  const [content, setContent] = useState('');

  const { execute: executeCreate, isExecuting: isCreatingTemplate } = useAction(createPromptTemplate, {
    onSuccess: () => {
      setMode({ type: 'viewing' });
      setContent('');
      toast.success(t('createSuccess'));
    },
    onError: ({ error }) => {
      toast.error(typeof error === 'string' ? error : t('createError'));
    },
  });

  const { execute: executeUpdate, isExecuting: isUpdatingTemplate } = useAction(updatePromptTemplate, {
    onSuccess: () => {
      setMode({ type: 'viewing' });
      setContent('');
      toast.success(t('updateSuccess'));
    },
    onError: ({ error }) => {
      toast.error(typeof error === 'string' ? error : t('updateError'));
    },
  });

  const { execute: executeDelete, isExecuting: isDeletingTemplate } = useAction(deletePromptTemplate, {
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
    },
    onError: ({ error }) => {
      toast.error(typeof error === 'string' ? error : t('deleteError'));
    },
  });

  const handleEdit = (template: PromptTemplate) => {
    setMode({ type: 'editing', templateId: template.SK });
    setContent(template.content);
  };

  const handleSaveEdit = () => {
    if (mode.type !== 'editing' || !content.trim()) return;
    executeUpdate({ id: mode.templateId, content });
  };

  const handleCancelEdit = () => {
    setMode({ type: 'viewing' });
    setContent('');
  };

  const handleDelete = (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    executeDelete({ id });
  };

  const handleCreate = () => {
    if (!content.trim()) return;
    executeCreate({ content });
  };

  const handleCancelCreate = () => {
    setMode({ type: 'viewing' });
    setContent('');
  };

  const startCreate = () => {
    setMode({ type: 'creating' });
    setContent('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Create new template - state machine-driven rendering */}
          {(() => {
            switch (mode.type) {
              case 'creating':
                return (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={t('placeholder')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-vertical"
                      rows={4}
                      autoFocus
                    />
                    <div className="flex gap-2 mt-3">
                      <Button onClick={handleCreate} size="sm" disabled={!content.trim() || isCreatingTemplate}>
                        <Save className="w-4 h-4 mr-1" />
                        {isCreatingTemplate ? t('saving') : t('save')}
                      </Button>
                      <Button onClick={handleCancelCreate} size="sm" variant="outline">
                        <X className="w-4 h-4 mr-1" />
                        {t('cancel')}
                      </Button>
                    </div>
                  </div>
                );
              case 'viewing':
              case 'editing':
                return (
                  <Button onClick={startCreate} variant="outline" className="w-full border-dashed">
                    <Plus className="w-4 h-4 mr-2" />
                    {t('createNew')}
                  </Button>
                );
              default:
                // Exhaustiveness check
                const _exhaustiveCheck: never = mode;
                return _exhaustiveCheck;
            }
          })()}

          {/* Template list - state machine-driven rendering per item */}
          {templates.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('noTemplates')}</div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => {
                // Check if this specific template is being edited using state machine
                const isEditingThisTemplate = mode.type === 'editing' && mode.templateId === template.SK;

                if (isEditingThisTemplate) {
                  return (
                    <div
                      key={template.SK}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div>
                        <textarea
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-vertical"
                          rows={4}
                          autoFocus
                        />
                        <div className="flex gap-2 mt-3">
                          <Button onClick={handleSaveEdit} size="sm" disabled={!content.trim() || isUpdatingTemplate}>
                            <Save className="w-4 h-4 mr-1" />
                            {isUpdatingTemplate ? t('saving') : t('save')}
                          </Button>
                          <Button onClick={handleCancelEdit} size="sm" variant="outline">
                            <X className="w-4 h-4 mr-1" />
                            {t('cancel')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={template.SK}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div>
                      <div className="cursor-pointer mb-3" onClick={() => onSelectTemplate(template)}>
                        <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                          {template.content}
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('createdAt', { date: formatDate(new Date(template.createdAt), localeForDate) })}
                        </span>
                        <div className="flex gap-2">
                          <Button onClick={() => handleEdit(template)} size="sm" variant="ghost">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(template.SK)}
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            disabled={isDeletingTemplate}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
