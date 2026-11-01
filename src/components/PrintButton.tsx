"use client";
export function PrintButton({ label }: { label: string }) {
  return <button className="btn no-print" onClick={() => window.print()}>{label}</button>;
}
