import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { json } from "@codemirror/lang-json";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";

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
  return (
    <CodeMirror
      value={defaultValue}
      theme={codeMirrorTheme}
      basicSetup={{
        foldGutter: true,
      }}
      lang={"json"}
      extensions={[json(), ...(lineWrapping ? [EditorView.lineWrapping] : [])]}
      defaultValue={defaultValue}
      onChange={onChange}
      className={cn("overflow-hidden rounded-md border", className)}
      editable={editable}
    />
  );
}
