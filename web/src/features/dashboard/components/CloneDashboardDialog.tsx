import { ExternalLinkIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

export function CloneDashboardDialog({
  dashboardName,
  setAsHome,
  hasPendingChange,
  existingCloneName,
  isPending,
  onConfirm,
  onOpenExisting,
}: {
  dashboardName: string;
  setAsHome: boolean;
  hasPendingChange: boolean;
  existingCloneName?: string;
  isPending: boolean;
  onConfirm: () => void;
  onOpenExisting: () => void;
}) {
  return (
    <Dialog
      title="Clone dashboard"
      actions={[
        {
          label: "Clone",
          loading: isPending,
          onClick: onConfirm,
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          The dashboard{" "}
          <span className="text-foreground font-bold">
            &ldquo;{dashboardName}&rdquo;
          </span>{" "}
          is maintained by Langfuse and can&rsquo;t be edited directly. Clone it
          to create an editable version in this project.
          {hasPendingChange && " Your change will be applied to the clone."}
          {setAsHome && " The clone will become your Home dashboard."}
        </p>
        <p className="text-muted-foreground">
          You can rearrange or remove Langfuse-maintained tiles. Editing their
          content isn&rsquo;t available yet.
        </p>
        {existingCloneName && (
          <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <span className="text-muted-foreground">
              This project already has a dashboard named{" "}
              <span className="text-foreground font-bold">
                &ldquo;{existingCloneName}&rdquo;
              </span>
              .
              {hasPendingChange
                ? " Opening it won’t apply your current change."
                : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              text="Open existing clone"
              icon={ExternalLinkIcon}
              disabled={isPending}
              onClick={onOpenExisting}
            />
          </div>
        )}
      </Dialog.Body>
    </Dialog>
  );
}
