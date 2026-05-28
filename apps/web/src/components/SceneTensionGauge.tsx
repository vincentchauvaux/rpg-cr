"use client";

import { TENSION_AXIS_LEFT, TENSION_AXIS_RIGHT, clampTension, tensionToAngleDeg } from "@rpg-cr/shared";

interface Props {
  tension: number;
  size?: number;
  className?: string;
}

/** Demi-cadran type compteur : gauche = périlleux, centre = neutre, droite = serein. */
export function SceneTensionGauge({ tension, size = 72, className }: Props) {
  const t = clampTension(tension);
  const angle = tensionToAngleDeg(t);
  const rad = (angle * Math.PI) / 180;
  const cx = 50;
  const cy = 48;
  const r = 38;
  const needleLen = 32;
  const nx = cx + needleLen * Math.cos(rad);
  const ny = cy - needleLen * Math.sin(rad);

  const arcLeft = polar(cx, cy, r, 180);
  const arcRight = polar(cx, cy, r, 0);

  return (
    <svg
      className={className}
      width={size}
      height={size * 0.58}
      viewBox="0 0 100 58"
      role="img"
      aria-label={`Tension narrative ${t}, de ${TENSION_AXIS_LEFT} à ${TENSION_AXIS_RIGHT}`}
    >
      <defs>
        <linearGradient id="scene-gauge-arc" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--invalid)" stopOpacity={0.85} />
          <stop offset="50%" stopColor="var(--text-muted)" stopOpacity={0.7} />
          <stop offset="100%" stopColor="var(--success)" stopOpacity={0.85} />
        </linearGradient>
      </defs>
      <path
        d={`M ${arcLeft.x} ${arcLeft.y} A ${r} ${r} 0 0 1 ${arcRight.x} ${arcRight.y}`}
        fill="none"
        stroke="url(#scene-gauge-arc)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="var(--border)" strokeWidth="0.5" opacity={0.5} />
      <circle cx={cx} cy={cy} r="3.5" fill="var(--accent)" />
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <text x="6" y="56" className="scene-gauge-axis" textAnchor="start">
        {TENSION_AXIS_LEFT}
      </text>
      <text x="94" y="56" className="scene-gauge-axis" textAnchor="end">
        {TENSION_AXIS_RIGHT}
      </text>
    </svg>
  );
}

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
