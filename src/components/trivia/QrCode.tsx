"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR code for the join link — dark modules on white so any phone camera reads it. */
export function QrCode({ value, className, label }: { value: string; className?: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1d20", light: "#ffffff" } })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label}
      className={className}
      // The SVG is generated locally by the qrcode library from our own URL.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
