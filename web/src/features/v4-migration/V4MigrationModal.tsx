import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Separator } from "@/src/components/ui/separator";
import {
  V4MigrationHeaderContent,
  V4MigrationDetailsContent,
} from "@/src/features/v4-migration/V4MigrationContent";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

// Modal variant of the migration panel (experiment): mounted on pages that
// use deprecated features (currently Evals) and opens on arrival.
export function V4MigrationModal() {
  const [open, setOpen] = useState(true);
  const { project } = useQueryProject();
  const { canToggleV4 } = useV4Beta();

  if (!canToggleV4 || !project) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        overlayMode="blocking"
        overlayClassName="backdrop-blur-sm"
        closeOnInteractionOutside
      >
        <DialogTitle className="sr-only">
          {`Migrate ${project.name} to v4`}
        </DialogTitle>
        <DialogBody className="gap-0 p-4">
          <V4MigrationHeaderContent projectName={project.name} />
          <Separator className="my-6" />
          <div className="flex flex-col gap-6">
            <V4MigrationDetailsContent
              onNavigate={() => setOpen(false)}
              projectId={project.id}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
