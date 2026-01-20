/**
 * LineNumber - Displays line number for a row
 *
 * Optional feature for showing line numbers on the left side.
 */

import { type JSONTheme } from "../types";

interface LineNumberProps {
  lineNumber: number;
  theme: JSONTheme;
  maxDigits?: number;
}

export function LineNumber({
  lineNumber,
  theme,
  maxDigits = 3,
}: LineNumberProps) {
  return (
    <span
      className="select-none"
      style={{
        display: "inline-block",
        width: `${maxDigits}ch`,
        textAlign: "right",
        marginRight: "8px",
        color: theme.lineNumberColor,
        opacity: 0.3,
        fontFamily: "monospace",
        fontSize: theme.fontSize,
      }}
    >
      {lineNumber}
    </span>
  );
}
