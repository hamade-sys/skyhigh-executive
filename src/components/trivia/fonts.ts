import { Inter, Montserrat } from "next/font/google";

/**
 * The ICAN pair, as on www.icanmena.com and portal.icanmena.com:
 * Montserrat for headings, board values and anything read across a
 * room; Inter for body copy.
 */
export const triviaFont = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-trivia",
  display: "swap",
});

export const triviaBodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-trivia-body",
  display: "swap",
});

/** Both font variables, for a layout's className. */
export const triviaFontVars = `${triviaFont.variable} ${triviaBodyFont.variable}`;
