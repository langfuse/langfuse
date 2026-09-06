/* eslint-disable @repo/no-null-render */
/**
 * Simple metadata badges for ObservationDetailView
 * Each badge handles its own null checks and returns null when data is unavailable
 */

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { useTranslations } from "next-intl";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (latencySeconds == null) return null;

  return (
    <Badge
      text={t("latency", { value: formatIntervalSeconds(latencySeconds) })}
    />
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (timeToFirstToken == null) return null;

  return (
    <Badge
      text={t("timeToFirstToken", {
        value: formatIntervalSeconds(timeToFirstToken),
      })}
    />
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null | undefined;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!environment) return null;

  return <Badge text={t("environment", { value: environment })} />;
}

export function ReleaseBadge({
  release,
}: {
  release: string | null | undefined;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!release) return null;

  return <Badge text={t("release", { value: release })} />;
}

export function VersionBadge({
  version,
}: {
  version: string | null | undefined;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!version) return null;

  return <Badge text={t("version", { value: version })} />;
}
