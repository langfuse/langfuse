import { Check } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { V4MigrationProjectChip } from "@/src/features/v4-migration/V4MigrationProjectChip";
import { type ProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";

/** The project's v4 readiness; an action needed opens the migration panel. */
export function ProjectMigrationBadge({
  project,
  readiness,
}: {
  project: { id: string; name: string };
  readiness: ProjectMigrationReadiness;
}) {
  if (readiness === "action-needed" || readiness === "partner-managed") {
    return <V4MigrationProjectChip project={project} readiness={readiness} />;
  }
  if (readiness === "ready") {
    return <Badge text="Ready for v4" color="green" leadingIcon={Check} />;
  }
  return (
    <Badge
      text={readiness === "checking" ? "Checking v4…" : "v4 status unavailable"}
      color="ghost"
    />
  );
}
