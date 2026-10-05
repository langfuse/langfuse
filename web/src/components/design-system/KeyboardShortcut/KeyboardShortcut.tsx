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
  "pointer-events-none inline-flex justify-center gap-1 rounded-sm font-mono leading-none font-normal select-none",
  {
    variants: {
      variant: {
        default: "items-baseline bg-transparent text-foreground-tertiary",
        subtle: "items-baseline bg-transparent text-foreground-tertiary",
        inverse: "items-baseline bg-transparent text-primary-foreground",
        keycap:
          "items-center border bg-muted px-1 align-middle text-muted-foreground",
      },
      size: {
        default: "h-5 min-w-5 text-xs",
        sm: "h-4 min-w-4 px-1 text-[10px]",
        xs: "h-3.5 min-w-3.5 px-1 text-[9px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const symbolSizeClass = {
  default: "text-lg",
  sm: "text-sm",
  xs: "text-xs",
} as const;

/** Set by TooltipContent so shortcuts inside a tooltip render as keycaps. */
export const KeyboardShortcutInTooltipContext = React.createContext(false);

export type KeyboardShortcutProps = {
  ref?: React.Ref<HTMLElement>;
  title?: string;
  keys: readonly [KeyboardKey, ...KeyboardKey[]];
} & VariantProps<typeof keyboardShortcutVariants>;

export function KeyboardShortcut({
  ref,
  keys,
  title,
  variant: variantProp,
  size,
}: KeyboardShortcutProps) {
  const inTooltip = React.useContext(KeyboardShortcutInTooltipContext);
  const variant = variantProp ?? (inTooltip ? "keycap" : "default");
  const isMac = useIsMac();
  const letterClass = variant === "keycap" ? undefined : "-translate-y-0.5";

  return (
    <kbd
      ref={ref}
      className={keyboardShortcutVariants({ variant, size })}
      title={title}
    >
      {keys.map((key, index) => {
        const label = getKeyboardKeyLabel(key, isMac);
        // Modifier and arrow glyphs draw small and high in the mono face; one step up, letters nudged up to meet them.
        const isSymbol = /^[^\p{L}\p{N}]$/u.test(label);
        return (
          <span
            key={index}
            className={
              isSymbol ? symbolSizeClass[size ?? "default"] : letterClass
            }
          >
            {label}
          </span>
        );
      })}
    </kbd>
  );
}
