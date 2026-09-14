import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuController,
} from "@/src/components/ui/dropdown-menu";
import {
  buildEventsTablePathForObservationType,
  buildEventsTablePathForSpanName,
} from "@/src/features/events";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type ObservationType } from "@langfuse/shared";
import {
  useWebCalloutAction,
  WebCalloutMenuItem,
} from "@/src/features/web-callouts/components/WebCalloutMenuItem";

type IdItem = {
  name: string;
  id: string;
};

type DetailHeaderActionsMenuControllerProps = {
  idItems: IdItem[];
  observationType?: ObservationType;
  projectId: string;
  observation?: {
    id: string;
    traceId: string;
    startTime: Date;
  };
  spanName?: string;
  webCallout?: {
    traceId: string | null;
    observationId?: string | null;
    sessionId?: string | null;
  };
  children: ComponentProps<typeof DropdownMenuController>["children"];
};

function buildObservationClickHouseQuery(
  projectId: string,
  observation: NonNullable<
    DetailHeaderActionsMenuControllerProps["observation"]
  >,
) {
  const quote = (value: string) =>
    `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  const minute = observation.startTime
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

  // Match the events_full primary-key prefix, without requiring microsecond
  // precision from the browser's Date. The query runs in the admin's SQL client.
  return `SELECT *
FROM events_full
WHERE project_id = ${quote(projectId)}
  AND toStartOfMinute(start_time) = toDateTime('${minute}:00', 'UTC')
  AND xxHash32(trace_id) = xxHash32(${quote(observation.traceId)})
  AND trace_id = ${quote(observation.traceId)}
  AND span_id = ${quote(observation.id)}
ORDER BY event_ts DESC
LIMIT 1;`;
}

function WebCalloutActionController({
  projectId,
  webCallout,
  children,
}: {
  projectId: string;
  webCallout: NonNullable<DetailHeaderActionsMenuControllerProps["webCallout"]>;
  children: (action: ReturnType<typeof useWebCalloutAction>) => ReactNode;
}) {
  const webCalloutAction = useWebCalloutAction(
    {
      projectId,
      traceId: webCallout.traceId,
      observationId: webCallout.observationId,
      sessionId: webCallout.sessionId,
    },
    true,
  );

  return children(webCalloutAction);
}

export function DetailHeaderActionsMenuController({
  idItems,
  observationType,
  projectId,
  observation,
  spanName,
  webCallout,
  children,
}: DetailHeaderActionsMenuControllerProps) {
  const router = useRouter();
  const session = useSession();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const clickHouseQuery =
    session.data?.user?.admin === true && observation
      ? buildObservationClickHouseQuery(projectId, observation)
      : null;

  const handleCopy = (textToCopy: string) => {
    copyTextToClipboard(textToCopy);
    setCopiedId(textToCopy);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const shouldShowFilterItem = Boolean(spanName?.trim());

  const href = shouldShowFilterItem
    ? buildEventsTablePathForSpanName({
        currentPath: router.asPath,
        projectId,
        spanName: spanName ?? "",
      })
    : null;

  const typeHref = observationType
    ? buildEventsTablePathForObservationType({
        currentPath: router.asPath,
        projectId,
        observationType,
      })
    : null;

  const filterTypeLabel = observationType ? `type:${observationType}` : null;

  return (
    <DropdownMenuController
      align="start"
      renderMenu={() => (
        <>
          {webCallout && (
            <WebCalloutActionController
              projectId={projectId}
              webCallout={webCallout}
            >
              {(webCalloutAction) =>
                webCalloutAction ? (
                  <WebCalloutMenuItem action={webCalloutAction} withSeparator />
                ) : null
              }
            </WebCalloutActionController>
          )}
          {(href || typeHref) && (
            <>
              {href && (
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => router.push(href)}
                >
                  <span className="max-w-[260px] truncate" title={spanName}>
                    filter by <span className="font-bold">name:{spanName}</span>
                  </span>
                </DropdownMenuItem>
              )}
              {typeHref && filterTypeLabel && (
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => router.push(typeHref)}
                >
                  <span
                    className="max-w-[260px] truncate"
                    title={filterTypeLabel}
                  >
                    filter by{" "}
                    <span className="font-bold">{filterTypeLabel}</span>
                  </span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {idItems.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="text-xs"
              onSelect={() => handleCopy(item.id)}
            >
              {copiedId === item.id ? (
                <CheckIcon className="text-muted-green mr-2 h-4 w-4" />
              ) : (
                <CopyIcon className="mr-2 h-4 w-4" />
              )}
              <span className="max-w-[260px] truncate" title={item.id}>
                Copy {item.name}
              </span>
            </DropdownMenuItem>
          ))}
          {clickHouseQuery && (
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => handleCopy(clickHouseQuery)}
            >
              {copiedId === clickHouseQuery ? (
                <CheckIcon className="text-muted-green mr-2 h-4 w-4" />
              ) : (
                <CopyIcon className="mr-2 h-4 w-4" />
              )}
              Copy ClickHouse query
            </DropdownMenuItem>
          )}
        </>
      )}
    >
      {children}
    </DropdownMenuController>
  );
}
