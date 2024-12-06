import { api } from "@/src/utils/api";
import { StatusBadge } from "@/src/components/layouts/status-badge";

export function BackgroundMigrationsStatusIndicator({}: {}) {
  const { data, isLoading, isError } =
    api.backgroundMigrations.status.useQuery();

  if (isLoading) {
    return <div />;
  }

  if (isError) {
    return <div />;
  }

  if (data.status === "SUCCEEDED") {
    return <div />;
  }

  return <StatusBadge type={data.status.toLowerCase()} showText={false} />;
}
