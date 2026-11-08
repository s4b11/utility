import React, { useState } from 'react';
import {
  Braces,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ChevronsUpDown,
  ChevronsDownUp,
  ChevronRight,
  Columns2,
  FileCode,
  ListTree,
} from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { FullscreenToggle } from '../../components/ui/FullscreenToggle';
import { useFullscreen, fullscreenClasses } from '../../lib/fullscreen';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { ConnectedGroup } from '../../components/ui/ConnectedGroup';

interface TreeNodeProps {
  keyName?: string | number;
  value: any;
  defaultOpen: boolean;
}

function JsonTreeNode({ keyName, value, defaultOpen }: TreeNodeProps) {
  const isObject = value !== null && typeof value === 'object';

  if (isObject) {
    const isArray = Array.isArray(value);
    const entries = isArray
      ? value.map((v: any, i: number) => [i, v])
      : Object.entries(value);

    return (
      <details open={defaultOpen}>
        <summary className="flex cursor-pointer list-none select-none items-center gap-1 rounded-sm py-0.5 pr-1 hover:bg-state-hover [&::-webkit-details-marker]:hidden">
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-on-surface-variant transition-transform duration-150 ease-spatial-fast [details[open]>summary>&]:rotate-90"
            aria-hidden="true"
          >
            <ChevronRight className="i h-3.5 w-3.5" />
          </span>
          {keyName !== undefined && (
            <span className="text-on-surface">
              {keyName}
              <span className="text-on-surface-variant">: </span>
            </span>
          )}
          <span className="text-on-surface-variant">
            {isArray ? `Array(${entries.length})` : `Object(${entries.length})`}
          </span>
        </summary>
        <div className="ml-2.5 border-l border-outline-variant pl-3.5">
          {entries.length === 0 ? (
            <span className="block py-0.5 body-small italic text-on-surface-variant">(empty)</span>
          ) : (
            entries.map(([k, v]: any) => (
              <JsonTreeNode
                key={k}
                keyName={k}
                value={v}
                defaultOpen={defaultOpen}
              />
            ))
          )}
        </div>
      </details>
    );
  }

  const type = value === null ? 'null' : typeof value;
  const colorClass =
    type === 'number'
      ? 'text-primary'
      : type === 'boolean'
      ? 'text-violet'
      : type === 'null'
      ? 'text-on-surface-variant italic'
      : 'text-success';

  return (
    <div className="py-0.5 pl-6">
      {keyName !== undefined && (
        <span className="text-on-surface">
          {keyName}
          <span className="text-on-surface-variant">: </span>
        </span>
      )}
      <span className={colorClass}>{JSON.stringify(value)}</span>
    </div>
  );
}

const SAMPLE_JSON = `{
  "name": "utility Mobile & Web",
  "version": "1.0.0",
  "features": {
    "offline_ready": true,
    "sqlite_storage": true,
    "encryption": "AES-256-GCM",
    "supported_platforms": ["Web PWA", "Android Tauri", "WASM Spin"]
  },
  "modules": [
    { "id": 1, "title": "Tasks", "enabled": true },
    { "id": 2, "title": "Calendar", "enabled": true },
    { "id": 3, "title": "Wallet", "enabled": true },
    { "id": 4, "title": "Notes", "enabled": true },
    { "id": 5, "title": "Commands", "enabled": true },
    { "id": 6, "title": "Links", "enabled": true },
    { "id": 7, "title": "JSON Inspector", "enabled": true },
    { "id": 8, "title": "Markdown Studio", "enabled": true }
  ]
}`;

type ViewMode = 'split' | 'input' | 'tree';

export function JsonToolView() {
  const toast = useToast();
  const fullscreen = useFullscreen();
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [inputJson, setInputJson] = useState(SAMPLE_JSON);
  const [expandAll, setExpandAll] = useState(true);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; message: string } | null>({
    type: 'ok',
    message: 'Valid JSON (8 keys/items)',
  });
  const [parsedData, setParsedData] = useState<any>(() => {
    try {
      return JSON.parse(SAMPLE_JSON);
    } catch {
      return null;
    }
  });

  const handleInputChange = (val: string) => {
    setInputJson(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setStatus(null);
      setParsedData(null);
      return;
    }

    try {
      const data = JSON.parse(trimmed);
      const count =
        data && typeof data === 'object'
          ? Array.isArray(data)
            ? `${data.length} items`
            : `${Object.keys(data).length} keys`
          : 'value';
      setStatus({ type: 'ok', message: `Valid JSON (${count})` });
      setParsedData(data);
    } catch (err: any) {
      setStatus({ type: 'err', message: err.message });
      setParsedData(null);
    }
  };

  const handleFormat = (indent: number) => {
    triggerHaptic('light');
    try {
      const data = JSON.parse(inputJson);
      const formatted = JSON.stringify(data, null, indent);
      setInputJson(formatted);
      setParsedData(data);
      setStatus({ type: 'ok', message: 'Valid JSON' });
      toast.success(indent ? `Formatted (${indent} spaces)` : 'Minified');
    } catch {
      toast.error('Invalid JSON');
    }
  };

  const handleClear = () => {
    triggerHaptic('light');
    setInputJson('');
    setParsedData(null);
    setStatus(null);
  };

  const handleToggleExpand = () => {
    triggerHaptic('light');
    setExpandAll((prev) => !prev);
  };

  const selectView = (mode: ViewMode) => {
    triggerHaptic('light');
    setViewMode(mode);
  };

  const fs = fullscreen.active;
  // Phones in full screen show one pane at a time; 'split' counts as the input.
  const mobilePane: 'input' | 'tree' = viewMode === 'tree' ? 'tree' : 'input';

  // Pane visibility. lg+ follows viewMode; below lg the normal page stacks both panes,
  // while full screen shows only `mobilePane`. Panes are hidden with CSS (never
  // unmounted) so the textarea and the tree's open/closed nodes keep their state.
  const inputDisplay = viewMode !== 'tree' ? 'flex' : fs ? 'hidden' : 'flex lg:hidden';
  const treeDisplay =
    viewMode === 'tree'
      ? 'flex'
      : viewMode === 'split'
      ? fs
        ? 'flex max-lg:hidden'
        : 'flex'
      : fs
      ? 'hidden'
      : 'flex lg:hidden';

  return (
    <div className={fs ? fullscreenClasses : 'flex w-full min-w-0 flex-col gap-4 pb-2'}>
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {fs && (
          <h2 className="mr-2 shrink-0 whitespace-nowrap title-medium text-on-surface">
            JSON inspector
          </h2>
        )}

        {/* Desktop layout switcher */}
        <ConnectedGroup
          className="inline-flex max-lg:hidden"
          ariaLabel="Layout"
          size="xs"
          value={viewMode}
          onChange={(v) => selectView(v)}
          options={[{ value: 'split', label: 'Split', icon: Columns2 }, { value: 'input', label: 'Input', icon: FileCode }, { value: 'tree', label: 'Tree', icon: ListTree }]}
        />

        {/* Phone pane switcher (full screen only; the normal page stacks both panes) */}
        {fs && (
          <ConnectedGroup
            className="lg:hidden"
            ariaLabel="View"
            size="xs"
            value={mobilePane}
            onChange={(v) => selectView(v)}
            options={[{ value: 'input', label: 'Input', icon: FileCode }, { value: 'tree', label: 'Tree', icon: ListTree }]}
          />
        )}

        <button type="button" onClick={() => handleFormat(2)} className="btn xs outlined">
          <Braces className="i" aria-hidden="true" />
          <span>Format 2</span>
        </button>

        <button type="button" onClick={() => handleFormat(4)} className="btn xs outlined">
          Format 4
        </button>

        <button type="button" onClick={() => handleFormat(0)} className="btn xs outlined">
          Minify
        </button>

        <button type="button" onClick={handleClear} className="btn xs text" aria-label="Clear JSON">
          <Trash2 className="i" aria-hidden="true" />
          <span>Clear</span>
        </button>

        {/* Status + full-screen toggle: badge sits left on phones, right from sm up;
            the toggle always ends the row. */}
        <div className="flex min-w-0 grow items-center justify-end gap-2">
          {status && (
            <span
              className={`status ${status.type === 'ok' ? 't-success' : 't-error'} mr-auto min-w-0 max-w-full sm:mr-0`}
              role="status"
              title={status.message}
            >
              {status.type === 'ok' ? (
                <CheckCircle2 className="i shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="i shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{status.message}</span>
            </span>
          )}
          <FullscreenToggle active={fs} onToggle={fullscreen.toggle} className="icon-btn shrink-0" />
        </div>
      </div>

      {/* Editor and tree */}
      <div
        className={`grid w-full min-w-0 grid-cols-1 gap-4 ${viewMode === 'split' ? 'lg:grid-cols-2' : ''} ${
          fs ? 'min-h-0 flex-1 grid-rows-[minmax(0,1fr)]' : 'items-start'
        }`}
      >
        {/* Editor Area */}
        <section className={`${inputDisplay} min-w-0 flex-col gap-2${fs ? ' min-h-0' : ''}`}>
          <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 px-1">
            <label htmlFor="json-source" className="field-label">
              JSON input
            </label>
            <CopyButton text={inputJson} ariaLabel="Copy JSON" />
          </div>

          <textarea
            id="json-source"
            value={inputJson}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder='{\n  "paste": "your JSON here"\n}'
            spellCheck={false}
            className={`textarea block w-full min-w-0 font-mono body-medium ${
              fs ? 'h-auto min-h-0 flex-1' : 'h-[320px] lg:h-[560px]'
            }`}
          />
        </section>

        {/* Tree Explorer Area */}
        <section
          className={`${treeDisplay} min-w-0 flex-col gap-2${fs ? ' min-h-0' : ''}`}
          aria-labelledby="json-preview-label"
        >
          <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 px-1">
            <span id="json-preview-label" className="field-label">
              Tree view
            </span>
            <button
              type="button"
              onClick={handleToggleExpand}
              className="icon-btn"
              aria-label={expandAll ? 'Collapse all' : 'Expand all'}
              data-tip={expandAll ? 'Collapse all' : 'Expand all'}
            >
              {expandAll ? (
                <ChevronsDownUp className="i" aria-hidden="true" />
              ) : (
                <ChevronsUpDown className="i" aria-hidden="true" />
              )}
            </button>
          </div>

          <div
            className={`panel w-full min-w-0 p-3 sm:p-4 ${
              fs
                ? 'h-auto min-h-0 flex-1 overflow-auto'
                : 'min-h-[320px] overflow-x-auto lg:h-[560px] lg:min-h-0 lg:overflow-y-auto'
            }`}
          >
            {parsedData !== null ? (
              <div key={String(expandAll)} className="json-tree min-w-0 break-words font-mono body-medium ">
                <JsonTreeNode value={parsedData} defaultOpen={expandAll} />
              </div>
            ) : (
              <div
                className={`flex items-center justify-center px-4 text-center body-medium text-on-surface-variant ${
                  fs ? 'h-full min-h-[200px]' : 'min-h-[280px]'
                }`}
              >
                Valid JSON shows up here as a collapsible tree.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
