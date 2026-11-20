import { useRouter } from "next/router";
import { TablePeekView } from "@/src/components/table/peek";
import { createPeekHeaderActions } from "@/src/components/ObservabilityEntityDetailHeader/fns/createPeekHeaderActions";
import { ConnectedSessionScopeActions } from "@/src/features/traces/components/ConnectedSessionScopeActions/ConnectedSessionScopeActions";
import { Trace } from "@/src/features/traces/components/Trace";

export function TablePeekViewSessionDetail({
  projectId,
  ...props
}: Omit<
  React.ComponentProps<typeof TablePeekView>,
  "children" | "title" | "itemType"
> & {
  projectId: string;
}) {
  const router = useRouter();
  const { query } = router;
  const sessionId = typeof query.peek === "string" ? query.peek : undefined;
  return (
    <TablePeekView
      {...props}
      itemType="SESSION"
      title={sessionId}
      hideExpandToggle
    >
      {({
        itemType,
        title,
        itemId,
        detailNavigationKey,
        resolveDetailNavigationPath,
        ...peekControls
      }) =>
        sessionId && (
          <ConnectedSessionScopeActions
            projectId={projectId}
            sessionId={sessionId}
          >
            {(actions) => (
              <Trace.Session
                context="peek"
                key={`${projectId}:${sessionId}`}
                projectId={projectId}
                sessionId={sessionId}
                header={{
                  variant: "peek",
                  headerProps: {
                    itemType,
                    title,
                    actions: [
                      ...actions,
                      ...createPeekHeaderActions({
                        ...peekControls,
                        navigation:
                          detailNavigationKey && resolveDetailNavigationPath
                            ? {
                                itemId,
                                listKey: detailNavigationKey,
                                resolvePath: resolveDetailNavigationPath,
                              }
                            : undefined,
                      }),
                    ],
                  },
                }}
              />
            )}
          </ConnectedSessionScopeActions>
        )
      }
    </TablePeekView>
  );
}
