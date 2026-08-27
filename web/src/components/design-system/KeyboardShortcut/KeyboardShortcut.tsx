import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { useIsMac } from "@/src/hooks/useIsMac";

type LetterKey =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

type DigitKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export type KeyboardKey =
  | LetterKey
  | DigitKey
  | "?"
  | "Mod"
  | "Control"
  | "Alt"
  | "Shift"
  | "Meta"
  | "Enter"
  | "Escape"
  | "Tab"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Space"
  | "Backspace"
  | "Delete";

const keyboardKeyLabels: Partial<Record<KeyboardKey, string>> = {
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Meta: "⌘",
  Enter: "↵",
  Escape: "Esc",
  Tab: "Tab",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  Backspace: "⌫",
  Delete: "Del",
};

function getKeyboardKeyLabel(key: KeyboardKey, isMac: boolean) {
  if (key === "Mod") {
    return isMac ? "⌘" : "Ctrl";
  }

  if (isMac && key === "Shift") {
    return "⇧";
  }

  if (isMac && key === "Alt") {
    return "⌥";
  }

  return keyboardKeyLabels[key] ?? key;
}

const keyboardShortcutVariants = cva(
  "pointer-events-none inline-flex items-center justify-center gap-1 rounded-md border font-mono leading-none font-bold select-none",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground shadow-xs",
        subtle: "bg-transparent text-muted-foreground shadow-none",
        inverse:
          "border-primary-foreground/30 bg-primary-foreground/20 text-primary-foreground shadow-xs",
      },
      size: {
        default: "h-5 min-w-5 px-1.5 text-[10px]",
        sm: "h-4 min-w-4 px-1 text-[9px]",
        xs: "h-3.5 min-w-3.5 px-1 text-[9px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type KeyboardShortcutProps = {
  ref?: React.Ref<HTMLElement>;
  title?: string;
  keys: readonly [KeyboardKey, ...KeyboardKey[]];
} & VariantProps<typeof keyboardShortcutVariants>;

export function KeyboardShortcut({
  ref,
  keys,
  title,
  variant,
  size,
}: KeyboardShortcutProps) {
  const isMac = useIsMac();

  return (
    <kbd
      ref={ref}
      className={keyboardShortcutVariants({ variant, size })}
      title={title}
    >
      {keys.map((key, index) => (
        <span key={index}>{getKeyboardKeyLabel(key, isMac)}</span>
      ))}
    </kbd>
  );
}
