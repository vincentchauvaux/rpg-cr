"use client";

interface Props {
  active: boolean;
}

/** Notes de chronique en arrière-plan — discret, non bloquant. */
export function ScribIndicator({ active }: Props) {
  if (!active) return null;

  return (
    <span
      className="scrib-indicator"
      role="status"
      aria-live="polite"
      aria-label="Le chroniqueur prend des notes en arrière-plan"
      title="Le chroniqueur prend des notes…"
    >
      <svg
        className="scrib-indicator-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3L5 20l2.5.8L12 14l4.5 6.8L19 20z" />
        <path d="M8 20h8" opacity="0.55" />
      </svg>
      <span className="scrib-indicator-spinner" aria-hidden />
    </span>
  );
}
