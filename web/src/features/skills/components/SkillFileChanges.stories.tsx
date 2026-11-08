import { type ComponentProps, useState } from "react";
import preview from "../../../../.storybook/preview";
import DiffViewer from "@/src/components/DiffViewer";
import { compareSkillFiles } from "../utils/compareSkillFiles";
import { SkillFileChanges } from "./SkillFileChanges";

const meta = preview.meta({ component: FileStatusesExample });

export const FileStatuses = meta.story({
  args: {
    files: compareSkillFiles(
      [
        { path: "SKILL.md", sha256Hash: "original" },
        { path: "references/legacy.md", sha256Hash: "removed" },
        { path: "scripts/review.py", sha256Hash: "unchanged" },
      ],
      [
        { path: "SKILL.md", sha256Hash: "updated" },
        { path: "references/checklist.md", sha256Hash: "added" },
        { path: "scripts/review.py", sha256Hash: "unchanged" },
      ],
    ),
    emptyMessage: "No file changes.",
  },
});

function FileStatusesExample({
  files,
  emptyMessage,
}: Pick<ComponentProps<typeof SkillFileChanges>, "files" | "emptyMessage">) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const selectedFile =
    files.find((file) => file.path === selectedPath) ?? files[0];
  return (
    <SkillFileChanges
      files={files}
      emptyMessage={emptyMessage}
      selectedFile={selectedFile}
      onSelectFile={setSelectedPath}
    >
      {selectedFile ? (
        <DiffViewer
          oldString={selectedFile.oldFile ? "Read the code.\n" : ""}
          newString={
            selectedFile.newFile ? "Read the code and run tests.\n" : ""
          }
          oldLabel="Version 1"
          newLabel="Draft"
        />
      ) : null}
    </SkillFileChanges>
  );
}
