import { defaultSettingsBothThemes } from "@/src/components/editor/shared-theme";
import { tags as t } from "@lezer/highlight";
import { createTheme, type CreateThemeOptions } from "@uiw/codemirror-themes";
import { bothThemeStyles } from "@/src/components/editor/shared-theme";

export const defaultSettingsLightTheme: CreateThemeOptions["settings"] = {
  ...defaultSettingsBothThemes,
};

export const lightThemeStyle: CreateThemeOptions["styles"] = [
  ...bothThemeStyles,
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
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.meta, t.comment], color: "#008000" },
  { tag: t.link, color: "#4078f2", textDecoration: "underline" },
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
