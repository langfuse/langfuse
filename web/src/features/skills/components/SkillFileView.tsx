import { type ReactNode, useState } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { CodeMirrorEditor } from "@/src/components/editor";
import { SkillFilePreview } from "./SkillFilePreview";
import { getSkillFileLanguageExtensions } from "../utils/getSkillFileLanguageExtensions";

export function SkillFileView({
  path,
  content,
  mode,
  children,
}: {
  path: string;
  content: string | undefined;
  mode:
    | { kind: "view" }
    | {
        kind: "draft";
        editable: boolean;
        onChange: (content: string) => void;
      };
  children?: ReactNode;
}) {
  const [formatted, setFormatted] = useState(mode.kind === "view");
  const isMarkdown = /\.(md|markdown)$/i.test(path);
  const showFormatted = isMarkdown && formatted;
  const display = showFormatted ? "formatted" : "raw";
  function renderFileContent() {
    if (content === undefined) return children;
    if (mode.kind === "draft" && !showFormatted) {
      return (
        <CodeMirrorEditor
          key={path}
          value={content}
          onChange={mode.editable ? mode.onChange : undefined}
          editable={mode.editable}
          mode="text"
          extensions={getSkillFileLanguageExtensions(path)}
          minHeight="500px"
          lineNumbers
          className="h-full"
        />
      );
    }
    return <SkillFilePreview path={path} content={content} format={display} />;
  }
  const fileBody = (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      {renderFileContent()}
    </div>
  );

  return (
    <section className="ph-no-capture flex h-full min-w-0 flex-col">
      <Tabs
        value={display}
        onValueChange={(value) => setFormatted(value === "formatted")}
        layout="fill"
      >
        <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
          <span className="min-w-0 truncate font-mono text-xs" title={path}>
            {path}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              text={mode.kind === "draft" ? "Editing draft" : "Viewing"}
              color={mode.kind === "draft" ? "blue" : "primary"}
            />
            {isMarkdown ? (
              <Tabs.List aria-label="File display" variant="inset" size="sm">
                <Tabs.Trigger value="formatted" label="Formatted" />
                <Tabs.Trigger value="raw" label="Raw" />
              </Tabs.List>
            ) : null}
          </div>
        </div>
        {isMarkdown ? (
          <Tabs.Content value={display} layout="fill">
            {fileBody}
          </Tabs.Content>
        ) : (
          fileBody
        )}
      </Tabs>
    </section>
  );
}
