import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must be taught the project's custom font-size tokens
 * (the June 2026 semantic type scale in globals.css @theme). Without
 * this, twMerge can't classify `text-label` / `text-body` / … and
 * falls back to treating them as text-COLOR classes — so any cn()
 * call that combined a size token with a color token silently dropped
 * one of them. That shipped as the v2.23 regression where the primary
 * button lost `text-primary-fg` (black text on black) and small
 * labels lost their size class (inherited 15-16px, "ugly big").
 * Registering them in the font-size class group makes them conflict
 * only with each other and the built-in text sizes, never with colors.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "caption",
            "label",
            "body-sm",
            "body",
            "body-lg",
            "title-sm",
            "title",
            "title-lg",
            "heading-sm",
            "heading",
            "heading-lg",
            "display",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
