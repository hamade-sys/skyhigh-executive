import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkyForce — Airline Strategy Simulation",
  description:
    "20-quarter airline strategy simulation. Build an airline, survive crises, outmaneuver rivals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-bg text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
