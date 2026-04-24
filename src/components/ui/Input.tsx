import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-line bg-surface px-3",
        "text-[0.9375rem] text-ink placeholder:text-ink-faint",
        "transition-colors duration-[var(--dur-fast)]",
        "hover:border-line-strong",
        "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
        "disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
      {...rest}
    />
  ),
);

Input.displayName = "Input";
