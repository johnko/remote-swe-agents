'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, FileDown, FileText, FileArchive, FileSpreadsheet, FileCode, File } from 'lucide-react';
import { getFileUrls } from '@/actions/file/action';

type FileViewerProps = {
  fileKeys: string[];
};

/**
 * State machine for individual file loading states.
 * Eliminates impossible states (loading=true + error=true) and makes
 * transitions explicit and type-safe.
 */
type FileLoadingState =
  | { status: 'loading' }
  | { status: 'success'; url: string }
  | { status: 'error' };

type FileData = {
  key: string;
  fileName: string;
} & FileLoadingState;

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) {
    return <FileText className="w-4 h-4 flex-shrink-0" />;
  }
  if (['zip', 'tar', 'gz', 'tgz', 'rar', '7z'].includes(ext)) {
    return <FileArchive className="w-4 h-4 flex-shrink-0" />;
  }
  if (['csv', 'xls', 'xlsx'].includes(ext)) {
    return <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />;
  }
  if (
    ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh'].includes(
      ext
    )
  ) {
    return <FileCode className="w-4 h-4 flex-shrink-0" />;
  }
  return <File className="w-4 h-4 flex-shrink-0" />;
};

const getFileName = (key: string): string => {
  const parts = key.split('/');
  return parts[parts.length - 1] || key;
};

const TAIL_CHARS = 8;

const MiddleEllipsisFileName = ({ name, className }: { name: string; className?: string }) => {
  if (name.length <= TAIL_CHARS * 2) {
    return <span className={`truncate min-w-0 ${className ?? ''}`}>{name}</span>;
  }
  const tail = name.slice(-TAIL_CHARS);
  const head = name.slice(0, -TAIL_CHARS);
  return (
    <span className={`flex min-w-0 ${className ?? ''}`}>
      <span className="truncate min-w-0">{head}</span>
      <span className="flex-shrink-0">{tail}</span>
    </span>
  );
};

export const FileViewer = ({ fileKeys }: FileViewerProps) => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [fileCache, setFileCache] = useState<Map<string, FileData>>(new Map());

  useEffect(() => {
    const loadFiles = async () => {
      // Initialize all files to loading state
      const currentFiles: FileData[] = fileKeys.map((key) => {
        const cached = fileCache.get(key);
        // Return cached success state or start loading
        return cached ?? { key, fileName: getFileName(key), status: 'loading' };
      });
      setFiles(currentFiles);

      try {
        const result = await getFileUrls({ keys: fileKeys });

        if (result?.data) {
          const newCache = new Map(fileCache);
          result.data.forEach((item) => {
            newCache.set(item.key, {
              key: item.key,
              fileName: getFileName(item.key),
              status: 'success',
              url: item.url,
            });
          });
          setFileCache(newCache);

          setFiles(
            fileKeys.map((key) => {
              const cached = newCache.get(key);
              return cached ?? { key, fileName: getFileName(key), status: 'error' };
            })
          );
        }
      } catch (error) {
        console.error('Failed to load file URLs:', error);
        const newCache = new Map(fileCache);
        fileKeys.forEach((key) => {
          if (!newCache.has(key)) {
            newCache.set(key, { key, fileName: getFileName(key), status: 'error' });
          }
        });
        setFileCache(newCache);

        setFiles(
          fileKeys.map((key) => {
            const cached = newCache.get(key);
            return cached ?? { key, fileName: getFileName(key), status: 'error' };
          })
        );
      }
    };

    if (fileKeys.length > 0) {
      loadFiles();
    }
    // `fileCache` is a mutable cross-render cache Map; intentionally not a
    // dependency (re-running on mutation would defeat the cache).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKeys]);

  if (fileKeys.length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <div className="flex flex-col gap-1.5">
        {files.map((file) => {
          // State machine-based rendering with exhaustiveness checking
          switch (file.status) {
            case 'loading':
              return (
                <div key={file.key}>
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-md max-w-full"
                    title={file.fileName}
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />
                    <MiddleEllipsisFileName name={file.fileName} className="text-sm text-gray-500" />
                  </div>
                </div>
              );
            case 'error':
              return (
                <div key={file.key}>
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-md max-w-full"
                    title={file.fileName}
                  >
                    {getFileIcon(file.fileName)}
                    <MiddleEllipsisFileName name={`${file.fileName} (Error)`} className="text-sm text-gray-500" />
                  </div>
                </div>
              );
            case 'success':
              return (
                <a
                  key={file.key}
                  href={file.url}
                  download={file.fileName}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group max-w-full"
                  title={file.fileName}
                >
                  {getFileIcon(file.fileName)}
                  <MiddleEllipsisFileName
                    name={file.fileName}
                    className="text-sm text-blue-600 dark:text-blue-400 group-hover:underline"
                  />
                  <FileDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                </a>
              );
            default:
              // Exhaustiveness check: ensures all states are handled
              const _exhaustiveCheck: never = file;
              return _exhaustiveCheck;
          }
        })}
      </div>
    </div>
  );
};
