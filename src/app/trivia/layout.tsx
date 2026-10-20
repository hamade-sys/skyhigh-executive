import type { Metadata } from "next";
import { triviaFontVars } from "@/components/trivia/fonts";

export const metadata: Metadata = {
  title: { default: "ICAN Trivia", template: "%s | ICAN Trivia" },
  description:
    "Jeopardy-style quiz games for workshops and team events. Build a board, put it on the big screen, and let everyone buzz in from their phone — no sign-up.",
};

export default function TriviaLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${triviaFontVars} flex min-h-0 flex-1 flex-col [font-family:var(--font-trivia-body),system-ui,sans-serif]`}>{children}</div>;
}
