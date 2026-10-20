import { type ComponentProps, type ReactNode } from "react";
import { Highlight, themes, type PrismTheme } from "prism-react-renderer";
import { useTheme } from "next-themes";

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
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
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
