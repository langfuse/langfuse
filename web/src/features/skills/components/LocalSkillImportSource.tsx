import { useState } from "react";
import type { FileWithPath } from "react-dropzone";
import { Dropzone } from "@/src/components/design-system/Dropzone/Dropzone";
import { discoverLocalSkills } from "../utils/local-import";
import type { SkillImportSourceProps } from "./skillImportTypes";

export function LocalSkillImportSource({
  busy,
  onScan,
  onReset,
}: SkillImportSourceProps) {
  const [files, setFiles] = useState<File[]>();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        Drop files, folders, or ZIPs containing SKILL.md and supporting files.
        ZIPs can be up to 3 MB each.
      </p>
      <div className="ph-no-capture">
        <Dropzone
          variant="panel"
          accept={undefined}
          maxFiles={10_000}
          maxSize={undefined}
          minSize={undefined}
          src={files}
          isDisabled={busy}
          onError={(error) => {
            onReset();
            setFiles(undefined);
            setError(error.message);
          }}
          onDrop={async (acceptedFiles: FileWithPath[]) => {
            if (!acceptedFiles.length || busy) return;
            setFiles(acceptedFiles);
            setError(undefined);
            await onScan(async () => ({
              skills: await discoverLocalSkills(
                acceptedFiles.map((file) => ({
                  // file-selector prefixes dropped paths with "/" or "./".
                  path: (
                    file.webkitRelativePath ||
                    file.relativePath ||
                    file.path ||
                    file.name
                  ).replace(/^(\.\/|\/)/, ""),
                  file,
                })),
              ),
              source: "local",
              commitMessage: "Imported from local files",
            }));
          }}
        />
      </div>
      {busy ? <p role="status">Scanning local files for skills…</p> : null}
      {error ? (
        <p role="alert" className="ph-no-capture text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
