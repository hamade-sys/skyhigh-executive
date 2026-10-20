import { cn } from "@/lib/cn";
import { initials } from "@/lib/trivia/codes";

export function formatScore(n: number): string {
  return `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}`;
}

/** Round initials badge for a person (dark text — every palette colour is light). */
export function PlayerBadge({ name, color, size = 36, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full t-font font-extrabold text-[#0b1d20]", className)}
      style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}
