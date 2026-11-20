import Page from "@/src/components/layouts/Page";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { Trace } from "@/src/features/traces/components/Trace";
import { ConnectedSessionScopeActions } from "@/src/features/traces/components/ConnectedSessionScopeActions/ConnectedSessionScopeActions";
import { useRouter } from "next/router";
import { getSessionDetailNavigationPath } from "@/src/features/sessions/fns/getSessionDetailNavigationPath";

export function ConnectedSessionDetailPage({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  const router = useRouter();

  return (
    <Page
      withPadding={false}
      scrollable={false}
      headerProps={{
        title: sessionId,
        hideTitleRow: true,
        breadcrumb: [
          { name: "Sessions", href: `/project/${projectId}/sessions` },
        ],
      }}
    >
      <div className="flex max-h-full min-h-0 flex-1 overflow-hidden">
        <ConnectedSessionScopeActions
          projectId={projectId}
          sessionId={sessionId}
        >
          {(actions) => (
            <Trace.Session
              key={`${projectId}:${sessionId}`}
              projectId={projectId}
              sessionId={sessionId}
              context="fullscreen"
              header={{
                variant: "page",
                headerProps: {
                  title: sessionId,
                  itemType: "SESSION",
                  actions: [
                    {
                      id: "navigation",
                      type: "custom",
                      pinned: true,
                      render: ({ layout }) =>
                        layout === "toolbar" ? (
                          <DetailPageNav
                            currentId={sessionId}
                            listKey="sessions"
                            path={(entry) =>
                              getSessionDetailNavigationPath({
                                projectId,
                                entry,
                                query: router.query,
                              })
                            }
                          />
                        ) : null,
                    },
                    ...actions,
                  ],
                },
              }}
            />
          )}
        </ConnectedSessionScopeActions>
      </div>
    </Page>
  );
}
