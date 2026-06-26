import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { ErrorPage } from "@/src/components/error-page";
import { TraceDetailActions } from "@/src/components/trace/TraceDetailActions";
import { useTraceDetailData } from "@/src/components/trace/useTraceDetailData";
import Page from "@/src/components/layouts/page";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import { useSession } from "next-auth/react";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { stripBasePath } from "@/src/utils/redirect";
import { Badge } from "@/src/components/ui/badge";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useEffect } from "react";

export function TracePage({
  traceId,
  timestamp,
}: {
  traceId: string;
  timestamp?: Date;
}) {
  const router = useRouter();
  const session = useSession();
  const routeProjectId = (router.query.projectId as string) ?? "";

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

  useEffect(() => {
    if (trace.cutoffObservationsAfterMaxCount) {
      showErrorToast(
        "Trace truncated",
        "This trace has too many observations for the detail view. Only a subset is shown.",
        "WARNING",
      );
    }
  }, [trace.cutoffObservationsAfterMaxCount]);

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
  const leadingControl = showPublicIndicators ? (
    session.status === "authenticated" ? (
      <Button
        asChild
        size="sm"
        variant="outline"
        title="Back to Langfuse"
        className="px-3"
      >
        <Link href="/">Langfuse</Link>
      </Button>
    ) : (
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
    )
  ) : undefined;
  const sharedBadge = showPublicIndicators ? (
    <Badge variant="outline" className="text-xs font-medium">
      Public
    </Badge>
  ) : undefined;

  return (
    <Page
      headerProps={{
        title: traceDetailTitle(trace.data) ?? trace.data.id,
        itemType: "TRACE",
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
                const { view, display, projectId } = router.query;
                const queryParams = new URLSearchParams({
                  ...(typeof view === "string" ? { view } : {}),
                  ...(typeof display === "string" ? { display } : {}),
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
              size="sm"
            />
            <TraceDetailActions
              traceId={trace.data.id}
              projectId={trace.data.projectId}
              bookmarked={trace.data.bookmarked}
              isPublic={trace.data.public}
              name={trace.data.name}
              timestamp={timestamp}
              deleteRedirectUrl={`/project/${router.query.projectId as string}/traces`}
            />
          </>
        ),
      }}
    >
      <div className="flex max-h-full min-h-0 flex-1 overflow-hidden">
        <TraceDetailBody
          trace={trace.data}
          context={router.query.peek !== undefined ? "peek" : "fullscreen"}
        />
      </div>
    </Page>
  );
}
