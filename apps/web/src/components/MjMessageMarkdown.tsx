"use client";

import type { Components } from "react-markdown";
import { useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { matchChoice } from "@rpg-cr/shared";

function markdownChildrenToText(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(markdownChildrenToText).join("");
  }
  if (typeof children === "object" && children !== null && "props" in children) {
    const el = children as { props?: { children?: ReactNode } };
    return markdownChildrenToText(el.props?.children);
  }
  return "";
}

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
  onChoiceClick?: (choice: string) => void;
}

/** Récit MJ en markdown sûr (pas de HTML brut). */
export function MjMessageMarkdown({
  content,
  choices = [],
  choicesClickable = false,
  choicesDisabled = false,
  activeChoice,
  onChoiceClick,
}: Props) {
  const interactive = choicesClickable && choices.length > 0 && Boolean(onChoiceClick);

  const components = useMemo<Components>(() => {
    if (!interactive) return BASE_COMPONENTS;

    return {
      ...BASE_COMPONENTS,
      ul: ({ children }) => <ul className="mj-choice-list">{children}</ul>,
      ol: ({ children }) => <ol className="mj-choice-list">{children}</ol>,
      li: ({ children }) => {
        const text = markdownChildrenToText(children).trim();
        const choice = matchChoice(choices, text);
        if (!choice) return <li>{children}</li>;

        const isActive =
          Boolean(activeChoice) &&
          Boolean(matchChoice([activeChoice ?? ""], choice));
        return (
          <li className={isActive ? "mj-choice mj-choice--active" : "mj-choice"}>
            <button
              type="button"
              className="mj-choice-btn"
              disabled={choicesDisabled}
              onClick={() => onChoiceClick?.(choice)}
            >
              {children}
            </button>
          </li>
        );
      },
    };
  }, [interactive, choices, choicesDisabled, activeChoice, onChoiceClick]);

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
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
