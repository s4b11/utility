import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ConnectedGroup } from '../../components/ui/ConnectedGroup';
import { marked } from 'marked';
import { api } from '../../lib/api';
import { CopyButton } from '../../components/ui/CopyButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { triggerHaptic } from '../../lib/haptics';
import { useFullscreen, fullscreenClasses } from '../../lib/fullscreen';
import { FullscreenToggle } from '../../components/ui/FullscreenToggle';
import {
  Columns2,
  FileEdit,
  Eye,
  Trash2,
  RotateCcw,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';

const INITIAL_MD = `# utility Markdown Preview

Welcome to your **safe**, server-sanitized Markdown editor.

### Features:
- Rendered with \`pulldown-cmark\` & \`ammonia\`
- Supports [links](https://github.com), tables, checklists, and code blocks
- Real-time live split-pane with synchronized rendering

| Feature | Support | Status |
| :--- | :--- | :--- |
| **PWA** | Full Offline Shell | Ready |
| **Tauri** | iOS & Android | Native |
| **Rust Wasm** | Fermyon Spin Cloud | Live |

> "Simplicity is the prerequisite for reliability."
> — *Edsger W. Dijkstra*

#### Task Checklist
- [x] Responsive full-width layout
- [x] Full-height editor and preview boxes
- [x] Exact \`.md-body\` typography rendering

\`\`\`rust
fn main() {
    println!("Hello from utility Web & Mobile!");
}
\`\`\`
`;

type ViewMode = 'split' | 'editor' | 'preview';

export function MarkdownToolView() {
  const [markdown, setMarkdown] = useState(INITIAL_MD);
  const [html, setHtml] = useState(() => {
    try {
      return marked.parse(INITIAL_MD, { gfm: true, breaks: true }) as string;
    } catch {
      return '';
    }
  });
  const [rendering, setRendering] = useState(false);
  const [serverSynced, setServerSynced] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const seqRef = useRef(0);
  const fullscreen = useFullscreen();
  const fs = fullscreen.active;

  // Statistics
  const stats = useMemo(() => {
    const text = markdown.trim();
    if (!text) return { words: 0, chars: 0, lines: 0 };
    const words = text.split(/\s+/).filter(Boolean).length;
    const chars = text.length;
    const lines = markdown.split('\n').length;
    return { words, chars, lines };
  }, [markdown]);

  useEffect(() => {
    let cancelled = false;
    const currentSeq = ++seqRef.current;

    if (!markdown.trim()) {
      setHtml('');
      setRendering(false);
      return;
    }

    // Instant local parse so user sees zero delay
    try {
      const localHtml = marked.parse(markdown, { gfm: true, breaks: true }) as string;
      if (!cancelled) {
        setHtml(localHtml);
      }
    } catch {
      // Ignore local error
    }

    // Debounced server render using pulldown-cmark + ammonia
    setRendering(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.markdown(markdown);
        if (!cancelled && currentSeq === seqRef.current) {
          setHtml(res.html);
          setServerSynced(true);
        }
      } catch {
        // If server fails or offline, local marked output remains active
        if (!cancelled && currentSeq === seqRef.current) {
          setServerSynced(false);
        }
      } finally {
        if (!cancelled && currentSeq === seqRef.current) {
          setRendering(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [markdown]);

  const handleClear = () => {
    triggerHaptic('light');
    setMarkdown('');
  };

  const handleReset = () => {
    triggerHaptic('light');
    setMarkdown(INITIAL_MD);
  };

  const selectView = (mode: ViewMode) => {
    triggerHaptic('light');
    setViewMode(mode);
  };

  // On phones the split view becomes Edit / Preview tabs: "split" shows the editor tab.
  const mobileTab: 'editor' | 'preview' = viewMode === 'preview' ? 'preview' : 'editor';

  // Full screen keeps this same element (and all state) and only swaps its classes: the
  // toolbar stays on top and the panes grid takes the remaining height.
  return (
    <div className={fs ? fullscreenClasses : 'flex w-full min-w-0 flex-col gap-4 pb-2'}>
      {/* Toolbar */}
      <div className={`flex flex-wrap items-center gap-2${fs ? ' shrink-0' : ''}`}>
        {/* The app header is covered in full screen, so name the tool here. */}
        {fs && (
          <h2 className="min-w-0 truncate title-medium text-on-surface lg:mr-2">
            Markdown editor
          </h2>
        )}

        {/* Desktop view switcher */}
        <ConnectedGroup
          className="inline-flex max-lg:hidden"
          ariaLabel="Layout"
          size="xs"
          value={viewMode}
          onChange={(v) => selectView(v)}
          options={[{ value: 'split', label: 'Split', icon: Columns2 }, { value: 'editor', label: 'Editor', icon: FileEdit }, { value: 'preview', label: 'Preview', icon: Eye }]}
        />

        {/* Mobile Edit / Preview tabs */}
        <ConnectedGroup
          className={`lg:hidden${fs ? ' order-last w-full' : ''}`}
          block={fs}
          ariaLabel="View"
          size="xs"
          value={mobileTab}
          onChange={(v) => selectView(v)}
          options={[{ value: 'editor', label: 'Edit', icon: FileEdit }, { value: 'preview', label: 'Preview', icon: Eye }]}
        />

        {/* Actions */}
        <div className="actions ml-auto">
          <CopyButton text={markdown} ariaLabel="Copy raw markdown" />
          <button
            type="button"
            onClick={handleReset}
            className="icon-btn"
            aria-label="Reset to sample"
            data-tip="Reset to sample"
          >
            <RotateCcw className="i" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="icon-btn danger"
            aria-label="Clear text"
            data-tip="Clear text"
          >
            <Trash2 className="i" aria-hidden="true" />
          </button>
          <FullscreenToggle active={fs} onToggle={fullscreen.toggle} />
        </div>
      </div>

      {/* Editor & Preview panes */}
      <div
        className={`grid w-full min-w-0 gap-4 ${
          fs ? 'min-h-0 flex-1 grid-rows-1 items-stretch' : 'items-start'
        } ${
          viewMode === 'split'
            ? 'grid-cols-1 lg:grid-cols-2'
            : 'grid-cols-1'
        }`}
      >
        {/* Editor Pane */}
        {(viewMode === 'split' || viewMode === 'editor') && (
          <section className={`flex min-w-0 flex-col gap-2${fs ? ' min-h-0' : ''}`}>
            <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 px-1">
              <label htmlFor="markdown-source" className="field-label">
                Markdown
              </label>
              <span className="truncate body-small text-on-surface-variant tabular">
                {stats.lines} lines · {stats.words} words · {stats.chars} chars
              </span>
            </div>
            <textarea
              id="markdown-source"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="# Type your markdown here..."
              spellCheck={false}
              className={`textarea block w-full min-w-0 font-mono body-medium ${
                fs ? 'h-auto min-h-0 flex-1 !resize-none' : 'h-[420px] lg:h-[560px]'
              }`}
            />
          </section>
        )}

        {/* Live Sanitized Preview Pane */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <section
            className={`${viewMode === 'split' ? 'flex max-lg:hidden' : 'flex'} min-w-0 flex-col gap-2${
              fs ? ' min-h-0' : ''
            }`}
            aria-labelledby="markdown-preview-label"
          >
            <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 px-1">
              <span id="markdown-preview-label" className="field-label">
                Preview
              </span>
              {rendering ? (
                <span className="status t-neutral" role="status">
                  <span className="dot" aria-hidden="true" />
                  Syncing
                </span>
              ) : serverSynced ? (
                <span className="status t-success" role="status">
                  <CheckCircle2 className="i" aria-hidden="true" />
                  Server sanitized
                </span>
              ) : (
                <span className="status t-warning" role="status">
                  <WifiOff className="i" aria-hidden="true" />
                  Client preview
                </span>
              )}
            </div>
            <div
              className={`panel w-full min-w-0 p-5 sm:p-6 ${
                fs
                  ? 'h-auto min-h-0 flex-1 overflow-auto'
                  : 'min-h-[420px] overflow-x-auto lg:h-[560px] lg:min-h-0 lg:overflow-y-auto'
              }`}
            >
              {html ? (
                <div
                  className={`md-body w-full min-w-0 break-words ${
                    fs && viewMode === 'preview' ? 'mx-auto max-w-[860px]' : 'max-w-none'
                  }`}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : rendering ? (
                <div className="space-y-4" role="status" aria-label="Rendering Markdown preview">
                  <Skeleton className="h-7 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ) : (
                <div className="flex min-h-[240px] items-center justify-center text-center body-medium text-on-surface-variant">
                  Your rendered Markdown shows up here.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
