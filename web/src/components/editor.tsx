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
}: {
  defaultValue: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  onBlur?: () => void;
  lineWrapping?: boolean;
  className?: string;
  mode: "json" | "text";
}) {
  const { resolvedTheme } = useTheme();
  const codeMirrorTheme = resolvedTheme === "dark" ? tokyoNight : githubLight;

  // used to disable linter when field is empty
  const [linterEnabled, setLinterEnabled] = useState<boolean>(
    !!defaultValue && defaultValue !== "",
  );

  const extensions = [];

  if (mode === "json") {
    extensions.push(json());
    if (linterEnabled) {
      extensions.push(linter(jsonParseLinter()));
    }
  }

  if (lineWrapping) {
    extensions.push(EditorView.lineWrapping);
  }

  return (
    <CodeMirror
      value={defaultValue}
      theme={codeMirrorTheme}
      basicSetup={{
        foldGutter: true,
        highlightActiveLine: false,
      }}
      lang={mode === "json" ? "json" : undefined}
      extensions={extensions}
      defaultValue={defaultValue}
      onChange={(c) => {
        if (onChange) onChange(c);
        setLinterEnabled(c !== "");
      }}
      onBlur={onBlur}
      className={cn("overflow-hidden rounded-md border text-xs", className)}
      editable={editable}
    />
  );
}
