import { useState } from "react";

import Header, { SubHeader } from "@/src/components/layouts/header";
import { HealthStatusBanner } from "@/src/features/v4-migration/HealthStatusBanner";
import { V4MigrationDetailsContent } from "@/src/features/v4-migration/V4MigrationContent";
import { SdkVersionsTable } from "@/src/features/v4-migration/SdkVersionsTable";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  createV4MigrationDetectionRange,
  getProjectMigrationReadiness,
} from "@/src/features/v4-migration/migrationData";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { api } from "@/src/utils/api";

/**
 * Project Health settings page: the permanent home for "is my instrumentation
 * healthy". The status banner answers "am I OK?" at a glance; the SDK table
 * is the always-on verify view; the migration checklist (embedded from the
 * migration panel, width-constrained to the drawer proportions it was
 * designed for) retires with the migration era.
 */
export function ProjectHealthSettingsPage({
  projectId,
}: {
  projectId: string;
}) {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(projectId);
  // Hour-bucketed 14-day window, held in state so the query key is stable.
  const [detectionRange] = useState(() => createV4MigrationDetectionRange());
  const sdkSummary = api.v4Transition.sdkUsageSummary.useQuery(
    {
      projectId,
      fromTimestamp: detectionRange.fromTimestamp,
      toTimestamp: detectionRange.toTimestamp,
    },
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 },
  );
  const migrationData = useProjectV4MigrationData({
    projectId,
    enabled: v4UpgradeUiEnabled,
  });
  const readiness = v4UpgradeUiEnabled
    ? getProjectMigrationReadiness(migrationData)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title="Health" />
        <p className="text-muted-foreground text-sm">
          Verify this project&apos;s instrumentation: which SDK versions send
          data, whether they are current, and what still needs attention.
        </p>
      </div>

      {readiness === "ready" && (
        <HealthStatusBanner tone="green">
          All checks passed. This project is fully v4 compatible.
        </HealthStatusBanner>
      )}
      {readiness === "action-needed" && (
        <HealthStatusBanner tone="yellow">
          This project needs attention — work through the action items below.
        </HealthStatusBanner>
      )}

      <div className="flex flex-col gap-2">
        <SubHeader title="SDK versions" />
        <p className="text-muted-foreground text-sm">
          Every SDK and version that sent data in the last 14 days.
        </p>
        {sdkSummary.isLoading ? (
          <p className="text-muted-foreground text-sm">Checking ingestion…</p>
        ) : sdkSummary.isError ? (
          <p className="text-muted-foreground text-sm">
            SDK usage is unavailable right now.
          </p>
        ) : (
          <SdkVersionsTable series={sdkSummary.data?.sdkUsageSeries ?? []} />
        )}
      </div>

      {v4UpgradeUiEnabled && (
        // The checklist was designed for a ~420px drawer; 672px is the widest
        // it stays legible (trigger rows, message boxes, the agent prompt).
        <div className="flex max-w-2xl flex-col gap-6">
          <V4MigrationDetailsContent projectId={projectId} host="page" />
        </div>
      )}
    </div>
  );
}
