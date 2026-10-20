import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The ICAN logo with the product name beside it — the same lock-up as
 * "ICAN Portal" and "ICAN Pipeline". The logo is the real wordmark
 * (public/ican-logo.png, identical to portal.icanmena.com's); never
 * the favicon redrawn as text. At hero sizes "Trivia" takes the deep
 * teal with the yellow highlighter, as headlines do on icanmena.com.
 */
export function Wordmark({ size = "md", className }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  // The PNG carries generous padding; the negative margin trims it so the
  // logo sits on the same baseline as the product name.
  const logoH = { sm: 46, md: 56, lg: 84, xl: 136 }[size];
  const text = { sm: "text-lg", md: "text-xl", lg: "text-[2rem]", xl: "text-[clamp(2.75rem,5.5vw,4.5rem)]" }[size];
  const hero = size === "lg" || size === "xl";
  return (
    <span className={cn("inline-flex items-center gap-1.5 t-font", className)}>
      <Image
        src="/ican-logo.png"
        alt="ICAN"
        width={664}
        height={375}
        priority={hero}
        className="-my-[0.3em] -ml-[0.15em] w-auto shrink-0 object-contain"
        style={{ height: logoH }}
      />
      <span className={cn("font-extrabold leading-none tracking-tight", text, hero ? "text-[#02797F]" : "text-[#545454]")}>
        {hero ? <span className="t-hl">Trivia</span> : "Trivia"}
      </span>
    </span>
  );
}
