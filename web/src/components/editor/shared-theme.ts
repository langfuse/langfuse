import { type CreateThemeOptions } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

export const defaultSettingsBothThemes: CreateThemeOptions["settings"] = {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  caret: "hsl(var(--foreground))",
  gutterBackground: "hsl(var(--sidebar-background))",
  gutterForeground: "hsl(var(--sidebar-foreground))",
  gutterBorder: "hsl(var(--sidebar-border))",
  gutterActiveForeground: "hsl(var(--sidebar-primary))",
  selection: "hsl(var(--accent))",
  selectionMatch: "hsl(var(--muted))",
  lineHighlight: "hsl(var(--muted))",
};

export const bothThemeStyles: CreateThemeOptions["styles"] = [
  { tag: t.invalid, color: "hsl(var(--dark-red))" },
  {
    tag: [
      t.name,
      t.deleted,
      t.character,
      t.macroName,
      t.propertyName,
      t.variableName,
      t.labelName,
      t.definition(t.name),
    ],
    color: "hsl(var(--primary-accent))",
  },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, textDecoration: "underline" },
];
