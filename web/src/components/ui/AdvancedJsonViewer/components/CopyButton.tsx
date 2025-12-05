/**
 * CopyButton - Copy value to clipboard
 *
 * Appears on hover, copies the JSON value to clipboard.
 * Uses existing clipboard utility from project.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { type JSONTheme } from "../types";
import { safeStringify } from "../utils/jsonTypes";

interface CopyButtonProps {
  value: unknown;
  theme: JSONTheme;
}

export function CopyButton({ value, theme }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const text = safeStringify(value, 2);
      await navigator.clipboard.writeText(text);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center transition-opacity hover:opacity-100"
      style={{
        width: "16px",
        height: "16px",
        color: theme.copyButtonColor,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
        marginLeft: "4px",
        opacity: 0.3,
      }}
      aria-label={copied ? "Copied!" : "Copy value"}
      title={copied ? "Copied!" : "Copy value"}
    >
      <Icon size={12} />
    </button>
  );
}
