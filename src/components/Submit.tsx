"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function Submit({ children, className = "btn-gold", name, value, disabled }: { children: ReactNode; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} name={name} value={value} disabled={pending || disabled} aria-busy={pending}>{pending ? "…" : children}</button>;
}
