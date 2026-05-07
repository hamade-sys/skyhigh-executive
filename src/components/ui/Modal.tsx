"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible label if there's no visible title inside the modal content. */
  ariaLabel?: string;
  className?: string;
};

/**
 * Modal built on native <dialog> — free focus trap, Escape close, top-layer
 * rendering so overflow-hidden ancestors don't clip it.
 */
export function Modal({
  open,
  onClose,
  children,
  ariaLabel,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Phase 7 P2 — focus restoration. Native <dialog>'s showModal()
  // moves focus into the dialog correctly, but on close() the
  // browser sometimes fails to return focus to the original
  // trigger (especially when the trigger was unmounted between
  // open and close). We capture activeElement on every open and
  // restore it on close so keyboard users land back exactly where
  // they were.
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Capture the element that had focus right before opening.
      const active = typeof document !== "undefined" ? document.activeElement : null;
      triggerRef.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      dlg.showModal();
    }
    if (!open && dlg.open) {
      dlg.close();
      // Defer focus restoration to the next paint so any close
      // animation / reflow has settled. If the trigger is still in
      // the DOM, focus it; otherwise the browser's default behavior
      // (focus → body) takes over.
      const target = triggerRef.current;
      if (target && typeof target.focus === "function") {
        requestAnimationFrame(() => {
          try {
            target.focus({ preventScroll: false });
          } catch { /* element no longer focusable — ignore */ }
        });
      }
    }
  }, [open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const handleClose = () => onClose();
    dlg.addEventListener("cancel", handleCancel);
    dlg.addEventListener("close", handleClose);
    return () => {
      dlg.removeEventListener("cancel", handleCancel);
      dlg.removeEventListener("close", handleClose);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      className={cn(
        "m-auto p-0 rounded-xl bg-surface text-ink shadow-[var(--shadow-4)]",
        "backdrop:bg-[rgba(16,37,63,0.32)] backdrop:backdrop-blur-sm",
        // Phase 7 P2 — mobile responsiveness. Cap width to viewport
        // minus a small padding, and cap height so long modals
        // (HelpModal, AircraftCompareModal) scroll within their
        // own container instead of pushing past the viewport edge
        // on small phones. The flex column lets header / footer
        // pin while body scrolls.
        "max-w-[calc(100vw-2rem)] w-[32rem]",
        "max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden",
        className,
      )}
      onClick={(e) => {
        // Click on backdrop (dialog element itself, not children) closes
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function ModalHeader({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-6 pt-6 pb-4 border-b border-line", className)}
      {...rest}
    />
  );
}

export function ModalBody({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-6 py-5 flex-1 min-h-0 overflow-y-auto",
        className,
      )}
      {...rest}
    />
  );
}

export function ModalFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-line flex items-center justify-end gap-2",
        className,
      )}
      {...rest}
    />
  );
}
