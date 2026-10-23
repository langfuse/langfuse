/* eslint-disable @typescript-eslint/no-use-before-define */
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
      theme={appliedTheme === "dark" ? DARK_THEME : LIGHT_THEME}
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

function withJsonTokens(theme: PrismTheme): PrismTheme {
  return { ...theme, styles: [...theme.styles, ...JSON_TOKEN_STYLES] };
}
