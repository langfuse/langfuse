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
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { api } from "@/src/utils/api";

// Modal variant of the migration panel (experiment): mounted on pages that
// use deprecated features (currently Evals) and opens on arrival.
export function V4MigrationModal() {
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const traceLevelEvalSummary = api.v4Transition.traceLevelEvalSummary.useQuery(
    { projectId: project?.id ?? "" },
    {
      enabled: v4UpgradeUiEnabled && Boolean(project),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );

  if (
    !v4UpgradeUiEnabled ||
    !project ||
    !traceLevelEvalSummary.data?.traceLevelEvalCount
  ) {
    return null;
  }

  // Keyed by project so a projectId-only navigation (which reuses the page
  // instance) re-opens the modal instead of inheriting the dismissal.
  return <V4MigrationModalContent key={project.id} project={project} />;
}

function V4MigrationModalContent({
  project,
}: {
  project: { id: string; name: string };
}) {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        overlayMode="blocking"
        overlayClassName="backdrop-blur-sm"
        closeOnInteractionOutside
      >
        <DialogTitle className="sr-only">
          {`Review v4 migration for ${project.name}`}
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
