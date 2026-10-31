"use client";

import { useState } from "react";
import { Icon } from "./Icon";

interface Props {
  value: string;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Copies `value`; the button itself says "Copied" (announced politely) for two seconds. */
export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", ariaLabel, className = "btn btn-outline btn-sm", style }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers: select-and-copy fallback.
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" onClick={copy} className={className} style={style} aria-label={copied ? copiedLabel : ariaLabel}>
      <Icon name={copied ? "check" : "copy"} size={15} />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
