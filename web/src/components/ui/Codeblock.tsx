import { Button } from "@/src/components/ui/button";
import { Check, Copy } from "lucide-react";
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

export const generateRandomString = (length: number, lowercase = false) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXY3456789"; // excluding similar looking characters like Z, 2, I, 1, O, 0
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return lowercase ? result.toLowerCase() : result;
};

const CodeBlock: FC<Props> = memo(({ language, value, theme }) => {
  const [isCopied, setIsCopied] = useState(false);
  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(value ?? "");
    setTimeout(() => setIsCopied(false), 1000);
  };

  return (
    <div className="codeblock relative my-3 w-full overflow-hidden rounded border font-sans dark:bg-zinc-950">
      <div className="flex w-full items-center justify-between bg-secondary px-6 pr-2">
        <span className="text-xs lowercase">{language}</span>
        <div className="flex items-center py-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-xs hover:bg-border focus-visible:ring-1 focus-visible:ring-offset-0"
            onClick={handleCopy}
          >
            {isCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
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
          padding: "1rem 1rem",
        }}
        codeTagProps={{
          style: {
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            display: "block",
          },
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
});
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
