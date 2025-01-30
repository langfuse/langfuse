import { tags as t } from "@lezer/highlight";
import { createTheme, type CreateThemeOptions } from "@uiw/codemirror-themes";

export const defaultSettingsLightTheme: CreateThemeOptions["settings"] = {
  background: "#ffffff",
  foreground: "#383a42",
  caret: "#000",
  selection: "#add6ff",
  selectionMatch: "#a8ac94",
  lineHighlight: "#99999926",
  gutterBackground: "#fff",
  gutterForeground: "#237893",
  gutterActiveForeground: "#0b216f",
  fontFamily:
    'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
};

export const lightThemeStyle: CreateThemeOptions["styles"] = [
  {
    tag: [
      t.keyword,
      t.operatorKeyword,
      t.modifier,
      t.color,
      t.constant(t.name),
      t.standard(t.name),
      t.standard(t.tagName),
      t.special(t.brace),
      t.atom,
      t.bool,
      t.special(t.variableName),
    ],
    color: "#0000ff",
  },
  { tag: [t.moduleKeyword, t.controlKeyword], color: "#af00db" },
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
    color: "#0070c1",
  },
  { tag: t.heading, fontWeight: "bold", color: "#0070c1" },
  {
    tag: [
      t.typeName,
      t.className,
      t.tagName,
      t.number,
      t.changed,
      t.annotation,
      t.self,
      t.namespace,
    ],
    color: "#267f99",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "#795e26",
  },
  { tag: [t.number], color: "#098658" },
  {
    tag: [t.operator, t.punctuation, t.separator, t.url, t.escape, t.regexp],
    color: "#383a42",
  },
  { tag: [t.regexp], color: "#af00db" },
  {
    tag: [t.special(t.string), t.processingInstruction, t.string, t.inserted],
    color: "#a31515",
  },
  { tag: [t.angleBracket], color: "#383a42" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.meta, t.comment], color: "#008000" },
  { tag: t.link, color: "#4078f2", textDecoration: "underline" },
  { tag: t.invalid, color: "#e45649" },
];

export function lightThemeInit(options?: Partial<CreateThemeOptions>) {
  const { theme = "light", settings = {}, styles = [] } = options || {};
  return createTheme({
    theme: theme,
    settings: {
      ...defaultSettingsLightTheme,
      ...settings,
    },
    styles: [...lightThemeStyle, ...styles],
  });
}

export const lightTheme = lightThemeInit();
