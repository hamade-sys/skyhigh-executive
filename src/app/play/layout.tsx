import type { Metadata, Viewport } from "next";
import { triviaFontVars } from "@/components/trivia/fonts";

export const metadata: Metadata = {
  title: "Play ICAN Trivia",
  description: "Join an ICAN Trivia game with the four-letter code on the big screen. No sign-up.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${triviaFontVars} trivia-stage flex min-h-0 flex-1 flex-col`}>{children}</div>;
}
