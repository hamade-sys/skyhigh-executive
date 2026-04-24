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

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
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
        "max-w-[calc(100vw-2rem)] w-[32rem]",
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
  return <div className={cn("px-6 py-5", className)} {...rest} />;
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
