/* eslint-disable boundaries/dependencies */
import { Button } from "@/src/components/ui/button";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { Check, Copy } from "lucide-react";
import { type FC, memo, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";

interface Props {
  language: string;
  value: string;
  theme?: "light" | "dark";
  /** Hide the language caption when the surrounding UI already states it. */
  showLanguage?: boolean;
  /** Match immutable form fields instead of using the recessed code surface. */
  variant?: "default" | "read-only";
}

const CodeBlock: FC<Props> = memo(
  ({ language, value, theme, showLanguage = true, variant = "default" }) => {
    const [isCopied, setIsCopied] = useState(false);
    const { resolvedTheme } = useTheme();
    const appliedTheme = theme ?? resolvedTheme;
    const handleCopy = () => {
      setIsCopied(true);
      copyTextToClipboard(value ?? "");
      setTimeout(() => setIsCopied(false), 1000);
    };

    const copyButton = (
      <Button
        variant="ghost"
        size="xs"
        className={cn(
          "text-xs focus-visible:ring-1 focus-visible:ring-offset-0",
          variant === "read-only"
            ? "text-muted-foreground hover:bg-background/50 absolute top-1.5 right-1.5"
            : "hover:bg-border",
        )}
        onClick={handleCopy}
      >
        {isCopied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        <span className="sr-only">Copy code</span>
      </Button>
    );

    return (
      <div
        className={cn(
          "codeblock relative w-full overflow-hidden rounded border font-sans",
          variant === "read-only" ? "bg-muted" : "bg-surface-code",
        )}
      >
        {variant === "default" ? (
          <div className="bg-surface-code-header flex w-full items-center justify-between px-2">
            {showLanguage ? (
              <span className="text-xs lowercase">{language}</span>
            ) : null}
            <div className="flex items-center py-1">{copyButton}</div>
          </div>
        ) : (
          copyButton
        )}
        <Highlight
          theme={appliedTheme === "dark" ? themes.vsDark : themes.github}
          code={value}
          language={language}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={className}
              style={{
                ...style,
                margin: 0,
                width: "100%",
                background: "transparent",
                padding:
                  variant === "read-only"
                    ? "0.75rem 2.5rem 0.75rem 0.75rem"
                    : "0.5rem",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                overflow: "auto",
              }}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    );
  },
);
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
