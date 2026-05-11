import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ActiveGameRibbon } from "@/components/marketing/ActiveGameRibbon";
import { ensureSupabaseRuntimeMigrations } from "@/lib/supabase/runtime-migrations";

// Adopts the ICAN brand assets from ican-crm — same favicon.png,
// apple-touch-icon.png, og-image.png in /public so all ICAN MENA
// surfaces (CRM, Projects, Booking Portal, Simulations) share one
// visual identity. The PNGs are the canonical formats; SVG copies
// stay in /public as edit-friendly originals.
//
// V14 — social share + app-icon metadata.
export const metadata: Metadata = {
  title: {
    default: "ICAN Simulations — Executive Industry Simulations",
    template: "%s | ICAN Simulations",
  },
  description:
    "Custom executive simulations built around your team's competencies. Airline live now; Banking, Hospitality, Agriculture, Real Estate, and Healthcare next.",
  metadataBase: new URL("https://sim.icanmena.com"),
  openGraph: {
    title: "ICAN Simulations — Executive Industry Simulations",
    description:
      "Lead an industry, not a spreadsheet. Custom executive simulations built around your team's competencies.",
    type: "website",
    url: "https://sim.icanmena.com",
    siteName: "ICAN Simulations",
    locale: "en_AE",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ICAN Simulations — Lead an industry, not a spreadsheet.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ICAN Simulations — Executive Industry Simulations",
    description:
      "Custom executive simulations built around your team's competencies.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.png",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/favicon.png" },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
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
  // Phase 7.1 — match the brand teal (was legacy navy #143559).
  themeColor: "#00C2CB",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await ensureSupabaseRuntimeMigrations();
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body className="h-full flex flex-col bg-bg text-ink antialiased overflow-hidden">
        <AuthProvider>
          <ActiveGameRibbon />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
