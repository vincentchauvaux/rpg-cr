"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const MJ_MARKDOWN_COMPONENTS: Components = {
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
}

/** Récit MJ en markdown sûr (pas de HTML brut). */
export function MjMessageMarkdown({ content }: Props) {
  return (
    <div className="chat-msg-mj">
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
        components={MJ_MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
