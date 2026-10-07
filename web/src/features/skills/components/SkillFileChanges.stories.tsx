import preview from "../../../../.storybook/preview";
import DiffViewer from "@/src/components/DiffViewer";
import { compareSkillFiles } from "../utils/compareSkillFiles";
import { SkillFileChanges } from "./SkillFileChanges";

const meta = preview.meta({ component: SkillFileChanges });

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
    renderDiff: (file) => (
      <DiffViewer
        oldString={file.oldFile ? "Read the code.\n" : ""}
        newString={file.newFile ? "Read the code and run tests.\n" : ""}
        oldLabel="Version 1"
        newLabel="Draft"
      />
    ),
  },
});
