"use client";

import type { RoomSideTab } from "@/lib/room-side-nav";
import {
  ROOM_DOCK_LEFT_TABS,
  ROOM_DOCK_RIGHT_TABS,
  ROOM_HOME_TAB,
} from "@/lib/room-side-nav";

function TabIcon({ tab }: { tab: RoomSideTab }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (tab) {
    case "main":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "sheet":
      return (
        <svg {...common} aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M8 13h8M8 17h6" />
        </svg>
      );
    case "companions":
      return (
        <svg {...common} aria-hidden>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "assistant":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    default:
      return null;
  }
}

interface Props {
  active: RoomSideTab;
  onChange: (tab: RoomSideTab) => void;
  hidden?: boolean;
}

function DockTabButton({
  tab,
  active,
  onChange,
}: {
  tab: (typeof ROOM_DOCK_LEFT_TABS)[number];
  active: RoomSideTab;
  onChange: (tab: RoomSideTab) => void;
}) {
  const isActive = active === tab.id;
  return (
    <button
      type="button"
      className={
        isActive ? "room-dock-btn room-dock-btn--active" : "room-dock-btn"
      }
      onClick={() => onChange(tab.id)}
      title={tab.title}
      aria-label={tab.title}
      aria-current={isActive ? "page" : undefined}
    >
      <TabIcon tab={tab.id} />
      <span className="room-dock-btn-label">{tab.label}</span>
    </button>
  );
}

export function RoomDockNav({ active, onChange, hidden }: Props) {
  if (hidden) return null;

  const homeActive = active === "main";

  return (
    <nav className="room-dock-nav" aria-label="Navigation du salon">
      <div className="room-dock-nav-inner">
        <div className="room-dock-nav-side room-dock-nav-side--left">
          {ROOM_DOCK_LEFT_TABS.map((t) => (
            <DockTabButton
              key={t.id}
              tab={t}
              active={active}
              onChange={onChange}
            />
          ))}
        </div>
        <button
          type="button"
          className={
            homeActive
              ? "room-dock-btn room-dock-btn--home room-dock-btn--active"
              : "room-dock-btn room-dock-btn--home"
          }
          onClick={() => onChange("main")}
          title={ROOM_HOME_TAB.title}
          aria-label={ROOM_HOME_TAB.title}
          aria-current={homeActive ? "page" : undefined}
        >
          <TabIcon tab="main" />
          <span className="room-dock-btn-label room-dock-btn-label--home">
            {ROOM_HOME_TAB.label}
          </span>
        </button>
        <div className="room-dock-nav-side room-dock-nav-side--right">
          {ROOM_DOCK_RIGHT_TABS.map((t) => (
            <DockTabButton
              key={t.id}
              tab={t}
              active={active}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
