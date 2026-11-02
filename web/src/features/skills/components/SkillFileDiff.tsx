import DiffViewer from "@/src/components/DiffViewer";
import { api } from "@/src/utils/api";
import { SkillComparisonError } from "./SkillComparisonError";

type FileContent = { content: string } | { sha256Hash: string } | null;

export function SkillFileDiff({
  projectId,
  oldFile,
  newFile,
  oldLabel,
  newLabel,
}: {
  projectId: string;
  oldFile: FileContent;
  newFile: FileContent;
  oldLabel: string;
  newLabel: string;
}) {
  const oldHash =
    oldFile && "sha256Hash" in oldFile ? oldFile.sha256Hash : null;
  const newHash =
    newFile && "sha256Hash" in newFile ? newFile.sha256Hash : null;
  const oldContent = api.skills.fileContents.useQuery(
    { projectId, sha256Hashes: oldHash ? [oldHash] : [] },
    {
      enabled: Boolean(oldHash),
      staleTime: Infinity,
      meta: { silentAllErrors: true },
    },
  );
  const newContent = api.skills.fileContents.useQuery(
    { projectId, sha256Hashes: newHash ? [newHash] : [] },
    {
      enabled: Boolean(newHash),
      staleTime: Infinity,
      meta: { silentAllErrors: true },
    },
  );
  const retry = () => {
    if (oldHash) oldContent.refetch();
    if (newHash) newContent.refetch();
  };
  if ((oldHash && oldContent.isError) || (newHash && newContent.isError)) {
    return <SkillComparisonError retry={retry} />;
  }
  if ((oldHash && oldContent.isPending) || (newHash && newContent.isPending)) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading file contents…
      </p>
    );
  }
  const oldString = getContent(oldFile, oldContent.data?.data);
  const newString = getContent(newFile, newContent.data?.data);
  if (oldString === undefined || newString === undefined) {
    return <SkillComparisonError retry={retry} />;
  }
  if (!oldString && !newString && (!oldFile || !newFile)) {
    return (
      <p className="text-muted-foreground text-sm">
        An empty file was {oldFile ? "removed" : "added"}.
      </p>
    );
  }
  return (
    <DiffViewer
      oldString={oldString}
      newString={newString}
      oldLabel={`${oldLabel}${oldFile ? "" : " · File absent"}`}
      newLabel={`${newLabel}${newFile ? "" : " · File absent"}`}
    />
  );
}

function getContent(
  file: FileContent,
  loaded: { sha256Hash: string; content: string }[] | undefined,
) {
  if (!file) return "";
  if ("content" in file) return file.content;
  return loaded?.find((item) => item.sha256Hash === file.sha256Hash)?.content;
}
