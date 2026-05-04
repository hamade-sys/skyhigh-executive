import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ActiveGameRibbon } from "@/components/marketing/ActiveGameRibbon";

export const metadata: Metadata = {
  title: "ICAN Simulations — Executive Industry Simulations",
  description:
    "Custom executive simulations built around your team's competencies. Airline live now; Banking, Hospitality, Agriculture, Real Estate, and Healthcare next.",
};

// Explicit viewport so the marketing landing page renders correctly on
// mobile and tablet, and so a desktop-first chrome doesn't push past
// the safe area on phones with notches. Game canvas itself is
// optimized for desktop (1024+) but the landing + onboarding flows
// should still be usable from a phone for sharing/preview.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#143559",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col bg-bg text-ink antialiased overflow-hidden">
        <AuthProvider>
          <ActiveGameRibbon />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
