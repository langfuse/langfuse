import { defaultSettingsBothThemes } from "@/src/components/editor/shared-theme";
import { tags as t } from "@lezer/highlight";
import { createTheme, type CreateThemeOptions } from "@uiw/codemirror-themes";
import { bothThemeStyles } from "@/src/components/editor/shared-theme";

export const defaultSettingsDarkTheme: CreateThemeOptions["settings"] = {
  ...defaultSettingsBothThemes,
};

export const darkThemeStyle: CreateThemeOptions["styles"] = [
  ...bothThemeStyles,
  { tag: t.keyword, color: "#bb9af7" },
  {
    tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)],
    color: "#9ece6a",
  },
  { tag: [t.labelName], color: "#7aa2f7" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#bb9af7" },
  { tag: [t.definition(t.name), t.separator], color: "#c0caf5" },
  { tag: [t.className], color: "#c0caf5" },
  {
    tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace],
    color: "#ff9e64",
  },
  { tag: [t.typeName], color: "#0db9d7" },
  { tag: [t.operator, t.operatorKeyword], color: "#bb9af7" },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "#b4f9f8" },
  { tag: [t.meta, t.comment], color: "#444b6a" },
  { tag: t.heading, fontWeight: "bold", color: "#89ddff" },
  { tag: [t.atom, t.bool], color: "#c0caf5" },
  { tag: t.strikethrough, textDecoration: "line-through" },
];

export const darkThemeInit = (options?: Partial<CreateThemeOptions>) => {
  const { theme = "dark", settings = {}, styles = [] } = options || {};
  return createTheme({
    theme: theme,
    settings: {
      ...defaultSettingsDarkTheme,
      ...settings,
    },
    styles: [...darkThemeStyle, ...styles],
  });
};

export const darkTheme = darkThemeInit();
