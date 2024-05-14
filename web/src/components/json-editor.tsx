import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { json } from "@codemirror/lang-json";
import { useTheme } from "next-themes";

// todo: add json linting

export function JsonEditor({
  defaultValue,
  onChange,
  editable = true,
  lineWrapping = true,
}: {
  defaultValue: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  lineWrapping?: boolean;
}) {
  const { theme } = useTheme();
  const codeMirrorTheme = theme === "dark" ? githubDark : githubLight;
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
      className="overflow-hidden rounded-md border"
      editable={editable}
    />
  );
}
