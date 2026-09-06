import { type V4MigrationTargetProject } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { type ProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import { PARTNER_INTEGRATION_FAQ_URL } from "@/src/features/v4-migration/partnerIntegrationDocs";
import { useTranslations } from "next-intl";

export function V4MigrationProjectChip({
  project,
  readiness,
}: {
  project: V4MigrationTargetProject;
  readiness: Extract<
    ProjectMigrationReadiness,
    "action-needed" | "partner-managed"
  >;
}) {
  const t = useTranslations("remainderUi.migrations");
  const openMigrationPanel = useOpenV4MigrationPanel();
  const capture = usePostHogClientCapture();

  // Forced-v3 projects show no migration action — the upgrade is handled by
  // their integration partner. Point them at the FAQ instead.
  if (readiness === "partner-managed") {
    return (
      <a
        href={PARTNER_INTEGRATION_FAQ_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          // Card is wrapped in a full-bleed <Link>; keep the docs link isolated.
          event.stopPropagation();
        }}
        className="text-muted-foreground ring-border hover:bg-muted/50 relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ring"
        title={t("partnerManaged.tooltip")}
      >
        {t("partnerManaged.projectChip")}
      </a>
    );
  }

  const handleClick = () => {
    capture("v4_migration:project_chip_clicked");
    openMigrationPanel(project, "project_chip");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-foreground ring-border hover:bg-muted/50 relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ring"
    >
      <span
        aria-hidden
        className="size-1.75 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
      ></span>
      {t("common.update")}
    </button>
  );
}
