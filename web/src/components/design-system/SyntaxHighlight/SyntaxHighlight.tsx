import { type ComponentProps, type ReactNode } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { useTheme } from "next-themes";

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
      theme={appliedTheme === "dark" ? themes.vsDark : themes.github}
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
