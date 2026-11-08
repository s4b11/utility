import React, { useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';

interface TagInputProps {
  label?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  /** Marks the label "Optional" (DESIGN.md 4.22). A trailing "(optional)" in `label` does the same. */
  optional?: boolean;
  className?: string;
}

/** Splits a trailing "(optional)" off a label so it renders as the 4.22 `.opt` marker. */
function splitLabel(label: string | undefined, optional?: boolean) {
  if (!label) return { text: '', opt: !!optional };
  const m = label.match(/^(.*?)\s*\(optional\)\s*$/i);
  return m ? { text: m[1], opt: true } : { text: label, opt: !!optional };
}

/** Coarse pointers get a 40px target; fine pointers keep the 32px 4.18 preset. */
const PRESET_TOUCH = '[@media(pointer:coarse)]:h-10';

export function TagInput({
  label = 'Tags',
  tags,
  onChange,
  suggestions = [],
  placeholder = 'Add tag and press Enter...',
  optional,
  className = '',
}: TagInputProps) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const inputId = `${uid}-input`;
  const { text: labelText, opt } = splitLabel(label, optional);

  const addTag = (t: string) => {
    const cleaned = t.trim().toLowerCase().replace(/^,|,$/g, '');
    if (!cleaned) return;
    if (!tags.includes(cleaned)) {
      triggerHaptic('light');
      onChange([...tags, cleaned]);
    }
    setInputVal('');
  };

  const removeTag = (tagToRemove: string) => {
    triggerHaptic('light');
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const unselectedSuggestions = suggestions.filter((s) => !tags.includes(s.toLowerCase()));

  return (
    <div className={`field min-w-0 ${className}`}>
      {labelText && (
        <label htmlFor={inputId} className="field-label">
          {labelText}
          {opt && <span className="opt"> (optional)</span>}
        </label>
      )}

      {/* Field-style box (4.22): tags (4.7) sit inline before the text input. */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
        className="tf-box flex cursor-text flex-wrap items-center gap-2 !px-3 !py-[11px]"
      >
        {tags.map((t) => (
          <span key={t} className="tag max-w-full pr-1">
            <span className="min-w-0 truncate">{t}</span>
            <button
              type="button"
              onClick={() => removeTag(t)}
              aria-label={`Remove tag ${t}`}
              className="relative grid h-[18px] w-[18px] shrink-0 place-items-center rounded-xs text-on-surface-variant transition-colors duration-150 after:absolute after:-inset-2 after:content-[''] hover:bg-state-pressed hover:text-on-surface"
            >
              <X className="i h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => inputVal && addTag(inputVal)}
          placeholder={tags.length === 0 ? placeholder : ''}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          className="min-w-[6rem] flex-1 !h-[26px] !w-auto !rounded-none !border-0 !bg-transparent !px-1 !py-0 text-on-surface !shadow-none outline-none placeholder:text-on-surface-variant"
        />
      </div>

      {unselectedSuggestions.length > 0 && (
        <div className="presets mb-0 items-center">
          <span className="mr-0.5 body-small text-on-surface-variant">Suggestions</span>
          {unselectedSuggestions.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              aria-label={`Add tag ${s}`}
              className={`chip inline-flex items-center gap-1 pl-2.5 ${PRESET_TOUCH}`}
            >
              <Plus className="i h-3.5 w-3.5" aria-hidden="true" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
