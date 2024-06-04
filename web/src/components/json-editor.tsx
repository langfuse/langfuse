import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";

// todo: add json linting

export function JsonEditor({
  defaultValue,
  onChange,
  editable = true,
  lineWrapping = true,
  className,
}: {
  defaultValue: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  lineWrapping?: boolean;
  className?: string;
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
      }}
      lang={"json"}
      extensions={[
        json(),
        ...(linterEnabled ? [linter(jsonParseLinter())] : []),
        ...(lineWrapping ? [EditorView.lineWrapping] : []),
      ]}
      defaultValue={defaultValue}
      onChange={(c) => {
        if (onChange) onChange(c);
        setLinterEnabled(c !== "");
      }}
      className={cn("overflow-hidden rounded-md border", className)}
      editable={editable}
    />
  );
}
