"use client";

import { useMemo, type CSSProperties } from "react";

const COLORS = ["#F7E300", "#00C2CB", "#56A98F", "#FFFFFF", "#FF8A65", "#B39DFF"];

/** A one-off confetti burst for the podium. Hidden under reduced motion. */
export function Confetti({ pieces = 90 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        color: COLORS[i % COLORS.length],
        delay: `${((i * 53) % 100) / 40}s`,
        dur: `${2.6 + ((i * 29) % 100) / 60}s`,
        dx: `${((i * 41) % 60) - 30}vw`,
        rot: `${360 + ((i * 67) % 720)}deg`,
        w: 6 + ((i * 13) % 8),
      })),
    [pieces],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="t-confetti"
          style={
            {
              left: b.left,
              background: b.color,
              width: b.w,
              "--delay": b.delay,
              "--dur": b.dur,
              "--dx": b.dx,
              "--rot": b.rot,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
