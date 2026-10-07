import { type ReactNode, useState } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type compareSkillFiles } from "@/src/features/skills/utils/compareSkillFiles";
import { cn } from "@/src/utils/tailwind";

const statusColors = {
  Modified: "blue",
  Added: "green",
  Removed: "red",
  Unchanged: "filled",
} as const;

export function SkillFileChanges({
  files,
  emptyMessage,
  renderDiff,
}: {
  files: ReturnType<typeof compareSkillFiles>;
  emptyMessage: string;
  renderDiff: (file: ReturnType<typeof compareSkillFiles>[number]) => ReactNode;
}) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const changedCount = files.filter(
    (file) => file.status !== "Unchanged",
  ).length;
  const selectedFile =
    files.find((file) => file.path === selectedPath) ?? files[0];
  if (!changedCount) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground text-sm">
        {changedCount} changed {changedCount === 1 ? "file" : "files"}
      </p>
      <div className="flex min-h-96 flex-1 flex-col gap-4 md:min-h-64 md:flex-row">
        <nav
          aria-label="Compared files"
          className="max-h-48 shrink-0 overflow-y-auto rounded-md border md:max-h-none md:w-64"
        >
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              aria-current={
                selectedFile?.path === file.path ? "true" : undefined
              }
              onClick={() => setSelectedPath(file.path)}
              className={cn(
                "hover:bg-accent flex w-full flex-col gap-1 border-b p-3 text-left text-sm last:border-b-0",
                selectedFile?.path === file.path && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "w-full break-words",
                  file.status === "Unchanged"
                    ? "text-muted-foreground"
                    : "font-bold",
                )}
              >
                {file.path}
              </span>
              <Badge
                text={file.status}
                color={statusColors[file.status]}
                size="sm"
              />
            </button>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {selectedFile ? (
            <section
              aria-label={`Changes to ${selectedFile.path}`}
              className="flex flex-col gap-3"
            >
              <h3 className="text-sm font-bold break-words">
                {selectedFile.path} · {selectedFile.status}
              </h3>
              {selectedFile.status === "Unchanged" ? (
                <p className="text-muted-foreground text-sm">
                  This file is unchanged.
                </p>
              ) : (
                <div key={selectedFile.path}>{renderDiff(selectedFile)}</div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
