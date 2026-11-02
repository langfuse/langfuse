"use client";

import * as React from "react";

import { CustomTooltip } from "../CustomTooltip/CustomTooltip";
import {
  KeyboardShortcut,
  type KeyboardShortcutProps,
} from "../KeyboardShortcut/KeyboardShortcut";

type TooltipProps = Omit<
  React.ComponentProps<typeof CustomTooltip>,
  "content"
> & {
  label: string;
  /** Rendered as a keycap after the label. */
  shortcut?: { keys: KeyboardShortcutProps["keys"] };
};

function Tooltip({ label, shortcut, ...props }: TooltipProps) {
  return (
    <CustomTooltip
      content={
        shortcut ? (
          <span className="inline-flex items-center gap-2">
            <span className="whitespace-pre-line">{label}</span>
            <KeyboardShortcut variant="keycap" keys={shortcut.keys} />
          </span>
        ) : (
          <span className="whitespace-pre-line">{label}</span>
        )
      }
      {...props}
    />
  );
}

export { Tooltip };
