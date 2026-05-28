"use client";

import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  validated: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  validated,
  collapsed,
  onToggleCollapse,
  children,
}: Props) {
  const [hover, setHover] = useState(false);

  if (collapsed && validated) {
    return (
      <section className="collapse-section collapse-section--done">
        <button
          type="button"
          className="collapse-header collapse-header--valid"
          onClick={onToggleCollapse}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          title="Cliquer pour modifier la configuration"
        >
          <span className="collapse-check" aria-hidden>
            ✓
          </span>
          <span>{title}</span>
          <span className="collapse-chevron">{hover ? "▾" : "▸"}</span>
        </button>
      </section>
    );
  }

  return (
    <section className="collapse-section">
      <div className="collapse-header-static">
        <h3 className={validated ? "section-title-valid" : undefined}>{title}</h3>
      </div>
      {children}
    </section>
  );
}
