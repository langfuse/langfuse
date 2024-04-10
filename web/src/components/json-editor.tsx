import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { json } from "@codemirror/lang-json";

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
  return (
    <CodeMirror
      value={defaultValue}
      theme={githubLight}
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
