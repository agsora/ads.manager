"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Button + floating panel. The panel is portaled to <body> with fixed positioning,
 * so cards with overflow:hidden never clip it. Closes on outside click, Escape, scroll or resize.
 */
export function Popover({
  button,
  children,
  align = "right",
  width = 300,
  label,
}: {
  button: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; w: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 24);
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    setPos({ top: r.bottom + 6, left, w });
  }, [open, width, align]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={anchor}>
      <div className="flex min-w-0" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={label}>
        {button(open)}
      </div>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            className="pop fixed z-[80] max-h-[calc(100vh-80px)] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.w }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** A row inside a popover menu. */
export function MenuItem({ icon, children, onClick, href, danger, active, hint }: { icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean; active?: boolean; hint?: string }) {
  const cls = `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition ${danger ? "text-[var(--critical-ink)] hover:bg-[#fbefec]" : active ? "bg-[var(--surface-2)] font-semibold" : "hover:bg-[var(--surface-2)]"}`;
  const inner = (
    <>
      {icon && <span className="grid w-4 shrink-0 place-items-center text-[var(--muted)]">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[11.5px] text-[var(--muted)]">{hint}</span>}
    </>
  );
  return href ? (
    <a href={href} className={cls} onClick={onClick}>
      {inner}
    </a>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}
