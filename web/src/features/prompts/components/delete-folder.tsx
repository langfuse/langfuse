import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { Trash, Loader2, Folder, FileText } from "lucide-react";

export function DeleteFolder({ folderPath }: { folderPath: string }) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hasAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });

  const prompts = api.prompts.all.useQuery(
    {
      projectId: projectId as string,
      pathPrefix: folderPath,
      page: 0,
      limit: 100, // Fetch up to 100 prompts to show in the list
      filter: [],
      orderBy: { column: "createdAt", order: "DESC" },
    },
    {
      enabled: isOpen && !!projectId,
    },
  );

  const mutDeleteFolder = api.prompts.delete.useMutation({
    onSuccess: () => {
      void utils.prompts.invalidate();
      setError(null);
      setIsOpen(false);
      setConfirmName("");
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const folderName = folderPath.split("/").pop() ?? folderPath;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setConfirmName("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="xs" disabled={!hasAccess}>
          <Trash className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-all">
            Delete All Prompts in Folder &quot;
            <i className="font-normal">{folderName}</i>&quot;
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            This action permanently deletes the folder{" "}
            <code className="relative break-all rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
              {folderPath}
            </code>{" "}
            and <b>all prompts inside it recursively</b>. This cannot be undone.
            If a prompt is still used in your application, your application will
            break.
          </p>

          <div className="rounded-md border bg-muted/50 p-4">
            <h4 className="mb-2 text-sm font-medium">Prompts to delete:</h4>
            {prompts.isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : prompts.isError ? (
              <div className="py-2 text-xs text-red-500">
                Failed to load prompts: {prompts.error.message}
              </div>
            ) : (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                {prompts.data?.prompts.map((p) => (
                  <li
                    key={`${p.row_type}-${p.id}`}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    {p.row_type === "folder" ? (
                      <Folder className="h-3 w-3 text-blue-500" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    <span className="break-all">
                      {folderPath}/{p.name}
                    </span>
                  </li>
                ))}
                {(prompts.data?.totalCount ?? 0) > 100 && (
                  <li className="pt-1 italic text-muted-foreground">
                    And {(prompts.data?.totalCount ?? 0) - 100} more prompts...
                  </li>
                )}
                {prompts.data?.prompts.length === 0 && (
                  <li className="italic text-muted-foreground">
                    No prompts found in this folder.
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              To confirm, type the full path of the folder to delete:
            </label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="folder to delete (full path)"
              className="h-9"
            />
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-medium">Error:</p>
              <p className="whitespace-pre-wrap">{error}</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={confirmName !== folderPath || mutDeleteFolder.isPending}
            loading={mutDeleteFolder.isPending}
            onClick={() => {
              if (!projectId) return;
              mutDeleteFolder.mutate({
                projectId,
                pathPrefix: folderPath,
              });
            }}
          >
            Delete Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
