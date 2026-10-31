"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Shown under the title. */
  subtitle?: React.ReactNode;
  width?: number;
}

/**
 * A modal dialog (a bottom sheet on phones). Traps focus, closes on Escape or the × button,
 * and returns focus to whatever opened it. The backdrop does not close it: a stray tap must
 * not lose a half-finished payment or form.
 */
export function Dialog({ title, onClose, children, subtitle, width }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      node ? Array.from(node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled")) : [];
    (focusables()[1] ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="backdrop">
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="dialog-head">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <span className="hint">{subtitle}</span>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="cross" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
