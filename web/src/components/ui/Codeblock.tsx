import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { Check, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { type FC, memo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  coldarkDark,
  solarizedlight,
} from "react-syntax-highlighter/dist/cjs/styles/prism";

interface Props {
  language: string;
  value: string;
  theme?: string;
  className?: string;
}

interface languageMap {
  [key: string]: string;
}

export const programmingLanguages: languageMap = {
  javascript: ".js",
  python: ".py",
  java: ".java",
  c: ".c",
  cpp: ".cpp",
  "c++": ".cpp",
  "c#": ".cs",
  ruby: ".rb",
  php: ".php",
  swift: ".swift",
  "objective-c": ".m",
  kotlin: ".kt",
  typescript: ".ts",
  go: ".go",
  perl: ".pl",
  rust: ".rs",
  scala: ".scala",
  haskell: ".hs",
  lua: ".lua",
  shell: ".sh",
  sql: ".sql",
  html: ".html",
  css: ".css",
  // add more file extensions here, make sure the key is same as language prop in CodeBlock.tsx component
};

const COLLAPSE_LINE_THRESHOLD = 8;

const CodeBlock: FC<Props> = memo(({ language, value, theme, className }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    value.split("\n").length > COLLAPSE_LINE_THRESHOLD,
  );

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(value ?? "");
    setTimeout(() => setIsCopied(false), 1000);
  };

  const lines = value.split("\n");
  const shouldCollapse = lines.length > COLLAPSE_LINE_THRESHOLD;
  const displayedValue =
    isCollapsed && shouldCollapse
      ? lines.slice(0, COLLAPSE_LINE_THRESHOLD).join("\n") + "\n..."
      : value;

  return (
    <div className="codeblock relative w-full overflow-hidden rounded border font-sans dark:bg-zinc-950">
      <div
        className={cn(
          "flex w-full items-center justify-between bg-secondary px-2",
          className,
        )}
      >
        <span className="text-xs lowercase">{language}</span>
        <div className="flex items-center gap-1 py-1">
          {shouldCollapse && (
            <Button
              variant="ghost"
              size="xs"
              className="text-xs hover:bg-border focus-visible:ring-1 focus-visible:ring-offset-0"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? "Show more code" : "Show less code"}
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="mr-1 h-3 w-3" /> Show more
                </>
              ) : (
                <>
                  <ChevronUp className="mr-1 h-3 w-3" /> Show less
                </>
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="text-xs hover:bg-border focus-visible:ring-1 focus-visible:ring-offset-0"
            onClick={handleCopy}
          >
            {isCopied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span className="sr-only">Copy code</span>
          </Button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={theme === "dark" ? coldarkDark : solarizedlight}
        PreTag="div"
        customStyle={{
          margin: 0,
          width: "100%",
          background: "transparent",
          padding: "0.5rem",
        }}
        codeTagProps={{
          style: {
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            display: "block",
          },
        }}
      >
        {displayedValue}
      </SyntaxHighlighter>
    </div>
  );
});
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
