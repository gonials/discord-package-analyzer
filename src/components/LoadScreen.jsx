import React, { useCallback, useRef, useState } from 'react';
import { parseZip, parseFileList, parseDirectoryHandle } from '../parser/discordExportParser';
import './LoadScreen.css';

export default function LoadScreen({ onLoad, onStartLoad, loading, error }) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const handleResult = useCallback(
    (data) => {
      setProgress(100);
      setProgressMessage('Done');
      onLoad(data);
    },
    [onLoad]
  );

  const handleError = useCallback((err) => {
    console.error('[Discord Analyzer]', err);
    onLoad({ error: err.message });
  }, [onLoad]);

  const startLoad = useCallback(() => {
    setProgress(0);
    setProgressMessage('');
    onStartLoad?.();
  }, [onStartLoad]);

  const onProgress = useCallback((percent, message) => {
    setProgress(Math.min(100, Math.max(0, percent)));
    setProgressMessage(message || '');
  }, []);

  const processZip = useCallback(
    async (file) => {
      startLoad();
      try {
        console.log('[Discord Analyzer] Loading ZIP:', file?.name);
        const data = await parseZip(file, { onProgress });
        console.log('[Discord Analyzer] ZIP parsed, messages:', data?.stats?.totalMessages);
        handleResult(data);
      } catch (e) {
        handleError(e);
      }
    },
    [handleResult, handleError, startLoad, onProgress]
  );

  const processFolder = useCallback(
    async (filesOrPairs) => {
      startLoad();
      try {
        const count = Array.isArray(filesOrPairs) ? filesOrPairs.length : filesOrPairs?.length ?? 0;
        console.log('[Discord Analyzer] Loading folder: ', count, 'items (File[] or { file, path }[])');
        const data = await parseFileList(filesOrPairs, { onProgress });
        console.log('[Discord Analyzer] Folder parsed, messages:', data?.stats?.totalMessages);
        handleResult(data);
      } catch (e) {
        handleError(e);
      }
    },
    [handleResult, handleError, startLoad, onProgress]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items = e.dataTransfer?.items;
      const files = e.dataTransfer?.files;
      if (items?.length) {
        const item = items[0];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry?.isFile) {
            const file = files[0];
            if (file?.name?.toLowerCase().endsWith('.zip')) {
              processZip(file);
              return;
            }
          }
          if (entry?.isDirectory) {
            readDirectoryEntry(entry).then(processFolder).catch(handleError);
            return;
          }
        }
      }
      if (files?.length === 1 && files[0].name?.toLowerCase().endsWith('.zip')) {
        processZip(files[0]);
        return;
      }
      if (files?.length) {
        const withPath = Array.from(files).every((f) => f.webkitRelativePath != null);
        if (withPath) processFolder(files);
        else handleError(new Error('Drop a ZIP file or select a folder via the button.'));
      }
    },
    [processZip, processFolder, handleError]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onSelectFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file?.name?.toLowerCase().endsWith('.zip')) {
        processZip(file);
      } else if (file) {
        handleError(new Error('Please select the Discord export ZIP file.'));
      }
      e.target.value = '';
    },
    [processZip, handleError]
  );

  const onSelectFolder = useCallback(
    async (e) => {
      const files = e.target.files;
      if (files?.length) {
        processFolder(files);
      }
      e.target.value = '';
    },
    [processFolder]
  );

  const onPickFolder = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      folderInputRef.current?.click();
      return;
    }
    startLoad();
    try {
      const dirHandle = await window.showDirectoryPicker();
      setProgressMessage('Reading folder…');
      const data = await parseDirectoryHandle(dirHandle, '', { onProgress });
      handleResult(data);
    } catch (e) {
      if (e.name !== 'AbortError') handleError(e);
    }
  }, [handleResult, handleError, startLoad, onProgress]);

  return (
    <div
      className="load-screen"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div className="load-card">
        <h1 className="load-title">Discord Data Analyzer by <span className="brand-gold">gonials</span></h1>
        <p className="load-subtitle">Load your Discord data export to see summaries and charts. All processing is local.</p>
        {error && <div className="load-error">{error}</div>}
        {loading && (
          <div className="load-progress-wrap">
            <div className="load-status">
              {progressMessage || 'Loading and parsing…'}
            </div>
            <div className="load-progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Loading progress">
              <div className="load-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <div className="load-options">
          <div className="load-option">
            <span className="load-option-label">1. Drag & drop your export ZIP here</span>
            <p className="load-option-hint">or drop an unzipped folder (if your browser supports it)</p>
          </div>
          <div className="load-option">
            <span className="load-option-label">2. Select ZIP file</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={onSelectFile}
              className="load-input"
            />
            <button type="button" className="btn-primary" onClick={() => fileInputRef.current?.click()}>
              Choose ZIP file
            </button>
          </div>
          <div className="load-option">
            <span className="load-option-label">3. Select unzipped folder</span>
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={onSelectFolder}
              className="load-input"
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
                  onPickFolder();
                } else {
                  folderInputRef.current?.click();
                }
              }}
            >
              Choose folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Read directory from drag-drop (DataTransferItem.webkitGetAsEntry).
 * Returns { file, path }[] so we never mutate File.webkitRelativePath (read-only in browsers).
 */
function readDirectoryEntry(dirEntry) {
  return new Promise((resolve, reject) => {
    const out = [];
    const reader = dirEntry.createReader();

    function read() {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            console.log('[Discord Analyzer] readDirectoryEntry: collected', out.length, 'files');
            resolve(out);
            return;
          }
          let pending = entries.length;
          entries.forEach((entry) => {
            if (entry.isFile) {
              entry.file(
                (file) => {
                  const path = entry.fullPath?.slice(1) || entry.name || file.name;
                  out.push({ file, path });
                  if (--pending === 0) resolve(out);
                },
                (err) => {
                  console.error('[Discord Analyzer] readDirectoryEntry file error', err);
                  reject(err);
                }
              );
            } else if (entry.isDirectory) {
              readDirectoryEntry(entry)
                .then((subPairs) => {
                  out.push(...subPairs);
                  if (--pending === 0) resolve(out);
                })
                .catch(reject);
            } else {
              if (--pending === 0) resolve(out);
            }
          });
        },
        (err) => {
          console.error('[Discord Analyzer] readDirectoryEntry readEntries error', err);
          reject(err);
        }
      );
    }
    read();
  });
}
