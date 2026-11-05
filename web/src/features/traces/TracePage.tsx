import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { ErrorPage } from "@/src/components/error-page";
import { TraceDetailActions } from "@/src/features/traces/components/TraceDetailActions";
import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import Page from "@/src/components/layouts/Page";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { useSession } from "next-auth/react";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { stripBasePath } from "@/src/utils/redirect";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { getTraceScopeTabs } from "./fns/getTraceScopeTabs";
import { getTraceScopeQuery } from "./fns/getTraceScopeQuery";
import { resolveTraceScope } from "./fns/resolveTraceScope";

export function TracePage({
  traceId,
  timestamp,
}: {
  traceId: string;
  timestamp?: Date;
}) {
  const router = useRouter();
  const session = useSession();
  const { isV4 } = useReadPath();
  const routeProjectId = (router.query.projectId as string) ?? "";
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId: routeProjectId },
  );

  // Shared, beta-aware fetch (same hook the peek uses).
  const trace = useTraceDetailData({
    projectId: routeProjectId,
    traceId,
    timestamp,
  });

  const projectIdForAccessCheck = trace.data?.projectId ?? routeProjectId;
  const hasProjectAccess = useIsAuthenticatedAndProjectMember(
    projectIdForAccessCheck,
  );

  if (trace.isUnauthorized)
    return <ErrorPage message="You do not have access to this trace." />;

  if (trace.isNotFound)
    return (
      <ErrorPage
        title="Trace not found"
        message="The trace is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => window.location.reload(),
        }}
      />
    );

  if (!trace.data) return <div className="p-3">Loading...</div>;

  const isSharedTrace = trace.data.public;
  const showPublicIndicators = isSharedTrace && !hasProjectAccess;
  const encodedTargetPath = encodeURIComponent(
    stripBasePath(router.asPath || "/"),
  );
  const leadingControl = (() => {
    if (showPublicIndicators) {
      if (session.status === "authenticated") {
        return (
          <Button
            asChild
            size="sm"
            variant="outline"
            title="Back to Langfuse"
            className="px-3"
          >
            <Link href="/">Langfuse</Link>
          </Button>
        );
      }
      return (
        <Button
          asChild
          size="sm"
          variant="default"
          title="Sign in to Langfuse"
          className="px-3"
        >
          <Link href={`/auth/sign-in?targetPath=${encodedTargetPath}`}>
            Sign in
          </Link>
        </Button>
      );
    }
    return undefined;
  })();
  const traceContext = router.query.peek !== undefined ? "peek" : "fullscreen";
  const sharedBadge = showPublicIndicators ? (
    <Badge color="outline" text="Public" uppercase />
  ) : undefined;
  const sessionId = trace.data.sessionId;
  const { canSelectSession, isSessionScope, showScopeToggle } =
    resolveTraceScope({
      unifiedTraceSessionViewEnabled,
      isV4,
      isProjectMember: hasProjectAccess,
      sessionId,
      aggregation: router.query.aggregation,
      context: traceContext,
    });

  return (
    <Page
      headerProps={{
        // Trace titles follow the route while the previous trace is kept as placeholder.
        title: isSessionScope && sessionId ? sessionId : traceId,
        itemType: isSessionScope ? "SESSION" : "TRACE",
        titleTabs: showScopeToggle
          ? getTraceScopeTabs({
              value: isSessionScope ? "session" : "trace",
              canSelectSession,
              onValueChange: (next) => {
                const query = getTraceScopeQuery(
                  router.query,
                  next,
                  trace.data?.observations,
                );
                return router.replace(
                  { pathname: router.pathname, query },
                  undefined,
                  {
                    shallow: true,
                  },
                );
              },
            })
          : undefined,
        divider: false,
        breadcrumb: [
          {
            name: "Traces",
            href: `/project/${router.query.projectId as string}/traces`,
          },
        ],
        showSidebarTrigger: !showPublicIndicators,
        leadingControl,
        breadcrumbBadges: sharedBadge,
        actionButtonsRight: (
          <>
            <DetailPageNav
              currentId={traceId}
              path={(entry) => {
                const { view, display, projectId, aggregation } = router.query;
                const queryParams = new URLSearchParams({
                  ...(typeof view === "string" ? { view } : {}),
                  ...(typeof display === "string" ? { display } : {}),
                  ...(aggregation === "session" ? { aggregation } : {}),
                });
                const timestamp =
                  entry.params && entry.params.timestamp
                    ? encodeURIComponent(entry.params.timestamp)
                    : undefined;

                if (timestamp) {
                  queryParams.set("timestamp", timestamp);
                }

                const finalQueryString = queryParams.size
                  ? `?${queryParams.toString()}`
                  : "";

                return `/project/${projectId as string}/traces/${entry.id}${finalQueryString}`;
              }}
              listKey="traces"
              compact
            />
            <TraceDetailActions
              isPlaceholderData={trace.isPlaceholderData}
              trace={trace.data}
              traceContext={traceContext}
              timestamp={timestamp}
              deleteRedirectUrl={`/project/${router.query.projectId as string}/traces`}
            />
          </>
        ),
        // Mobile compact header: the same trace actions as full-width labeled
        // menu rows (Make Public / Delete) for the `⋯` overflow, instead of the
        // inline icon toolbar. Trace-to-trace nav is desktop-only.
        actionButtonsMenu: (
          <TraceDetailActions
            isPlaceholderData={trace.isPlaceholderData}
            trace={trace.data}
            traceContext={traceContext}
            timestamp={timestamp}
            deleteRedirectUrl={`/project/${router.query.projectId as string}/traces`}
            layout="menu"
          />
        ),
      }}
    >
      <div className="flex max-h-full min-h-0 flex-1 overflow-hidden">
        <TraceDetailBody
          trace={trace.data}
          context={traceContext}
          truncatedAtObservations={trace.truncatedAtObservations}
          isPlaceholderData={trace.isPlaceholderData}
        />
      </div>
    </Page>
  );
}
