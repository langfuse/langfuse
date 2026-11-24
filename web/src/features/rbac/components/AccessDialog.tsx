import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

/** The shell of the role dialogs: names the scope, then who the access is for. */
export function AccessDialog({
  level,
  projectName,
  subject,
  isSaveDisabled,
  onSave,
  children,
}: {
  level: "organization" | "project";
  /** Project level only. */
  projectName?: string;
  /** The person or group the access is for. */
  subject: React.ReactNode;
  isSaveDisabled: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  const title =
    level === "project"
      ? `Project access in ${projectName ?? "this project"}`
      : "Organization access";
  return (
    <Dialog
      title={title}
      closeLabel="Cancel"
      actions={[{ label: "Save", disabled: isSaveDisabled, onClick: onSave }]}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-5 text-sm">
          <p className="text-muted-foreground ph-no-capture">{subject}</p>
          {children}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
