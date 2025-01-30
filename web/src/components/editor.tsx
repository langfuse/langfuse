import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";

export function CodeMirrorEditor({
  defaultValue,
  onChange,
  editable = true,
  lineWrapping = true,
  className,
  onBlur,
  mode,
  minHeight,
}: {
  defaultValue: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  onBlur?: () => void;
  lineWrapping?: boolean;
  className?: string;
  mode: "json" | "text";
  minHeight: "none" | 100 | 200;
}) {
  const { resolvedTheme } = useTheme();
  const codeMirrorTheme = resolvedTheme === "dark" ? tokyoNight : githubLight;

  // used to disable linter when field is empty
  const [linterEnabled, setLinterEnabled] = useState<boolean>(
    !!defaultValue && defaultValue !== "",
  );

  return (
    <CodeMirror
      value={defaultValue}
      theme={codeMirrorTheme}
      basicSetup={{
        foldGutter: true,
        highlightActiveLine: false,
      }}
      lang={mode === "json" ? "json" : undefined}
      extensions={[
        // Extend gutter to full height when minHeight > content height
        // This also enlarges the text area to minHeight
        ...(minHeight === "none"
          ? []
          : [
              EditorView.theme({
                ".cm-gutter,.cm-content": { minHeight: `${minHeight}px` },
                ".cm-scroller": { overflow: "auto" },
              }),
            ]),
        ...(mode === "json" ? [json()] : []),
        ...(mode === "json" && linterEnabled
          ? [linter(jsonParseLinter())]
          : []),
        ...(lineWrapping ? [EditorView.lineWrapping] : []),
      ]}
      defaultValue={defaultValue}
      onChange={(c) => {
        if (onChange) onChange(c);
        setLinterEnabled(c !== "");
      }}
      onBlur={onBlur}
      className={cn(
        "overflow-hidden overflow-y-auto rounded-md border text-xs",
        className,
      )}
      editable={editable}
    />
  );
}
