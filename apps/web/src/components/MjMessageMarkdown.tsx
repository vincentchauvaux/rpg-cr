"use client";

import { useEffect, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { matchChoice, stripTrailingMjChoiceList } from "@rpg-cr/shared";

const BASE_COMPONENTS: Components = {
  h2: ({ children }) => <h2 className="chat-msg-mj-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="chat-msg-mj-h3">{children}</h3>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="chat-msg-mj-voice">{children}</blockquote>
  ),
  a: ({ children }) => <span>{children}</span>,
};

interface Props {
  content: string;
  choices?: string[];
  choicesClickable?: boolean;
  choicesDisabled?: boolean;
  activeChoice?: string;
  activeChoices?: string[];
  onChoiceClick?: (choice: string) => void;
  selectId?: string;
}

/** Récit MJ en markdown sûr (pas de HTML brut). */
export function MjMessageMarkdown({
  content,
  choices = [],
  choicesClickable = false,
  choicesDisabled = false,
  activeChoice,
  activeChoices,
  onChoiceClick,
  selectId = "mj-choice-select",
}: Props) {
  const interactive = choicesClickable && choices.length > 0 && Boolean(onChoiceClick);
  const selectedKey = `${activeChoice ?? ""}\n${(activeChoices ?? []).join("\n")}`;
  const displayContent = interactive ? stripTrailingMjChoiceList(content) : content;
  const [picked, setPicked] = useState("");

  useEffect(() => {
    setPicked("");
  }, [content, choicesClickable]);

  const selected = useMemo(
    () => selectedKey.split("\n").filter(Boolean),
    [selectedKey]
  );
  const selectedValue =
    choices.find((c) => selected.some((s) => Boolean(matchChoice([s], c)))) ??
    picked;

  return (
    <div className={interactive ? "chat-msg-mj chat-msg-mj--choices" : "chat-msg-mj"}>
      <ReactMarkdown
        disallowedElements={[
          "script",
          "style",
          "iframe",
          "object",
          "embed",
          "form",
          "input",
          "button",
        ]}
        unwrapDisallowed
        components={BASE_COMPONENTS}
      >
        {displayContent}
      </ReactMarkdown>
      {interactive ? (
        <div className="mj-choice-select-wrap">
          <label className="mj-choice-select-label" htmlFor={selectId}>
            Piste du MJ
          </label>
          <select
            id={selectId}
            className="mj-choice-select"
            disabled={choicesDisabled}
            value={selectedValue}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              setPicked(next);
              onChoiceClick?.(next);
            }}
          >
            <option value="">Choisir une piste…</option>
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
