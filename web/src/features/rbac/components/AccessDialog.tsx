import Link from "next/link";
import { Building, House } from "@langfuse/icons";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { IconTile } from "@/src/features/rbac/components/IconTile";

/** The shell of the role dialogs: names the scope, then who the access is for. */
export function AccessDialog({
  level,
  projectName,
  projectHref,
  subject,
  isSaveDisabled,
  onSave,
  footerNote,
  children,
}: {
  level: "organization" | "project";
  /** Project level only. */
  projectName?: string;
  /** Project level only: makes the project's name a link. */
  projectHref?: string;
  /** The person or group, shown under the title. */
  subject: React.ReactNode;
  isSaveDisabled: boolean;
  onSave: () => void;
  /** A note about what the dialog cannot change, shown beside the buttons. */
  footerNote?: React.ReactNode;
  children: React.ReactNode;
}) {
  const onProject = level === "project";
  const project = projectName ?? "this project";
  return (
    <Dialog
      title={
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 text-base leading-5 font-bold whitespace-pre">
            {onProject ? (
              <>
                <span className="shrink-0">Project access in </span>
                {projectHref ? (
                  <Link
                    href={projectHref}
                    title={project}
                    className="decoration-muted-foreground/60 min-w-0 truncate underline underline-offset-2"
                  >
                    {project}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate" title={project}>
                    {project}
                  </span>
                )}
                <span className="shrink-0"> for</span>
              </>
            ) : (
              "Organization access for"
            )}
          </span>
          <span className="text-muted-foreground ph-no-capture block text-sm leading-snug font-normal">
            {subject}
          </span>
        </span>
      }
      titleMedia={<IconTile icon={onProject ? House : Building} />}
      footerNote={footerNote}
      closeLabel="Cancel"
      actions={[{ label: "Save", disabled: isSaveDisabled, onClick: onSave }]}
    >
      <Dialog.Body spacing="compact" separators="bottom">
        <div className="flex flex-col gap-5 text-sm">{children}</div>
      </Dialog.Body>
    </Dialog>
  );
}
