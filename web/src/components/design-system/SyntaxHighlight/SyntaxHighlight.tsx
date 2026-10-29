import { type ComponentProps, type ReactNode } from "react";
import {
  Highlight,
  Prism,
  themes,
  type PrismTheme,
} from "prism-react-renderer";
import { useTheme } from "next-themes";
import bash from "refractor/bash";
import toml from "refractor/toml";

// prism-react-renderer bundles no shell or TOML grammar. `bash` also registers `sh` and `shell`.
bash(Prism);
toml(Prism);

/** JSON token colors shared with the table JSON viewer; Prism aliases `null` to `keyword`. */
const JSON_TOKEN_STYLES: PrismTheme["styles"] = [
  { types: ["property"], style: { color: "hsl(var(--muted-foreground))" } },
  { types: ["string"], style: { color: "var(--json-value-string)" } },
  { types: ["number"], style: { color: "var(--json-value-number)" } },
  { types: ["boolean"], style: { color: "var(--json-value-boolean)" } },
  {
    types: ["null", "keyword"],
    style: { color: "var(--json-value-nullish)" },
  },
].map((entry) => ({ ...entry, languages: ["json"] }));

const LIGHT_THEME = withJsonTokens(themes.github);
const DARK_THEME = withJsonTokens(themes.vsDark);

const SHELL_LANGUAGES = new Set(["bash", "sh", "shell"]);

/**
 * Shell gets a whole theme because plain text is themed too (VS Dark renders it light blue).
 * App colours, so it follows light/dark mode on its own: values in the JSON viewer's string
 * green, commands in the search bar's keyword blue, punctuation muted.
 */
const SHELL_THEME: PrismTheme = {
  plain: { color: "hsl(var(--foreground))" },
  styles: [
    {
      types: [
        "comment",
        "shebang",
        "punctuation",
        "operator",
        "file-descriptor",
      ],
      style: { color: "hsl(var(--muted-foreground))" },
    },
    {
      types: ["string", "char", "number", "boolean"],
      style: { color: "var(--json-value-string)" },
    },
    {
      types: ["function", "builtin", "keyword"],
      style: { color: "hsl(var(--qlang-keyword))" },
    },
  ],
};

/** Shares token rendering while callers own the code container and controls. */
export function SyntaxHighlight({
  code,
  language,
  theme,
  children,
}: Pick<ComponentProps<typeof Highlight>, "code" | "language"> & {
  theme?: "light" | "dark";
  children: (
    props: Pick<
      Parameters<ComponentProps<typeof Highlight>["children"]>[0],
      "className" | "style"
    > & { content: ReactNode },
  ) => ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const appliedTheme = theme ?? resolvedTheme;

  return (
    <Highlight
      code={code}
      language={language}
      theme={pickTheme(language, appliedTheme)}
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) =>
        children({
          className,
          style,
          content: tokens.map((line, index) => (
            <div key={index} {...getLineProps({ line })}>
              {line.map((token, key) => {
                // Prism's per-type class names include Tailwind utilities such as `table`; the theme styles tokens inline instead.
                const { style, children } = getTokenProps({ token });
                return (
                  <span
                    key={key}
                    style={style}
                    data-token={token.types.join(" ")}
                  >
                    {children}
                  </span>
                );
              })}
            </div>
          )),
        })
      }
    </Highlight>
  );
}

function pickTheme(language: string, mode: string | undefined): PrismTheme {
  if (SHELL_LANGUAGES.has(language)) return SHELL_THEME;
  return mode === "dark" ? DARK_THEME : LIGHT_THEME;
}

function withJsonTokens(theme: PrismTheme): PrismTheme {
  return { ...theme, styles: [...theme.styles, ...JSON_TOKEN_STYLES] };
}
