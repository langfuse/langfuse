import { useState } from "react";

import Header from "@/src/components/layouts/header";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationBadgeContent";
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
 * healthy". Two sections today — the per-SDK-version traffic table (the
 * verify view, always on) and the v4 migration checklist (embedded from the
 * migration panel, retires with the migration era). The status row gives the
 * calm all-green confirmation this page exists for.
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
        <p className="text-muted-foreground flex items-center gap-2.5 text-sm">
          <V4MigrationStatusDot variant="done" />
          All checks passed. This project is fully v4 compatible.
        </p>
      )}
      {readiness === "action-needed" && (
        <p className="text-muted-foreground flex items-center gap-2.5 text-sm">
          <V4MigrationStatusDot variant="action" />
          This project needs attention — see the action items below.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-bold">SDK versions</h3>
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
        <div className="flex flex-col gap-6">
          <V4MigrationDetailsContent projectId={projectId} />
        </div>
      )}
    </div>
  );
}
