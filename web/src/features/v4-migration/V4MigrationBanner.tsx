import Link from "next/link";
import { Zap } from "lucide-react";
import { Callout } from "@/src/components/ui/callout";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
// Shorter than the Callout default (30d) so the banner resurfaces while the
// migration deadline approaches.
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Org-overview banner announcing v4 with links to the migration status page
 * and docs. Replaces the agent-tools banner for v4-upgrade users.
 */
export function V4MigrationBanner() {
  const capture = usePostHogClientCapture();

  return (
    <Callout
      className="mb-4"
      id="v4-migration-banner:v1"
      ttlMs={DISMISS_TTL_MS}
      variant="info"
      align="middle"
      actions={() => (
        <>
          <Button asChild size="sm" variant="secondary">
            <Link
              href="/v4-migration"
              onClick={() =>
                capture("v4_migration:overview_banner_status_clicked")
              }
            >
              Check status
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a
              href={V4_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                capture("v4_migration:overview_banner_docs_clicked")
              }
            >
              Docs
            </a>
          </Button>
        </>
      )}
    >
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-bold">
            Langfuse v4 is here: real-time and up to 165× faster.
          </span>{" "}
          All projects need an upgrade.
        </span>
      </div>
    </Callout>
  );
}
