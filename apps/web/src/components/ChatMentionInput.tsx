"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  applyMentionSelection,
  filterMentionCandidates,
  parseActiveMention,
  type MentionCandidate,
} from "@rpg-cr/shared";

function mentionMetaLine(c: MentionCandidate): string {
  if (c.hint?.trim()) return c.hint.trim();
  switch (c.kind) {
    case "player":
      return "Joueur";
    case "companion":
      return "Compagnon";
    default:
      return "Personnage";
  }
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  candidates: MentionCandidate[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatMentionInput({
  value,
  onChange,
  onSubmit,
  candidates,
  disabled,
  placeholder,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [cursor, setCursor] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeStart, setActiveStart] = useState(0);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const filtered = filterMentionCandidates(candidates, query, 8);

  const syncMentionState = useCallback(
    (text: string, cursorIndex: number) => {
      const active = parseActiveMention(text, cursorIndex);
      if (!active) {
        setMenuOpen(false);
        setQuery("");
        return;
      }
      setMenuOpen(true);
      setActiveStart(active.start);
      setQuery(active.query);
      setHighlight(0);
    },
    []
  );

  useLayoutEffect(() => {
    syncMentionState(value, cursor);
  }, [value, cursor, syncMentionState]);

  useEffect(() => {
    if (!menuOpen) return;
    const el = menuRef.current?.querySelector<HTMLElement>(
      `[data-mention-idx="${highlight}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, menuOpen, filtered.length]);

  function pick(candidate: MentionCandidate) {
    const input = inputRef.current;
    const pos = input?.selectionStart ?? cursor;
    const { next, cursor: nextCursor } = applyMentionSelection(
      value,
      activeStart,
      pos,
      candidate.name
    );
    onChange(next);
    setMenuOpen(false);
    setQuery("");
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
      setCursor(nextCursor);
    });
  }

  function handleChange(text: string) {
    onChange(text);
    const pos = inputRef.current?.selectionStart ?? text.length;
    setCursor(pos);
    syncMentionState(text, pos);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (menuOpen && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(filtered[highlight]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="chat-mention-field">
      {menuOpen && filtered.length > 0 ? (
        <ul
          ref={menuRef}
          className="chat-mention-menu"
          role="listbox"
          aria-label="Mentionner un personnage"
        >
          {filtered.map((c, i) => (
            <li key={`${c.kind}-${c.name}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                data-mention-idx={i}
                className={
                  i === highlight
                    ? "chat-mention-option chat-mention-option--active"
                    : "chat-mention-option"
                }
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="chat-mention-option-name">@{c.name}</span>
                <span className="chat-mention-option-meta muted">
                  {mentionMetaLine(c)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : menuOpen && query.length > 0 && filtered.length === 0 ? (
        <p className="chat-mention-menu chat-mention-menu--empty muted" role="status">
          Aucun personnage pour « @{query} »
        </p>
      ) : null}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={(e) => {
          const t = e.target as HTMLInputElement;
          setCursor(t.selectionStart ?? 0);
        }}
        onClick={(e) => {
          const t = e.target as HTMLInputElement;
          setCursor(t.selectionStart ?? 0);
        }}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        aria-autocomplete="list"
        aria-expanded={menuOpen && filtered.length > 0}
        aria-controls={menuOpen ? "chat-mention-listbox" : undefined}
      />
    </div>
  );
}
