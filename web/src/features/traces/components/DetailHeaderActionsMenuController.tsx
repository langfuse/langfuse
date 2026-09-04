import { useRouter } from "next/router";
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
} from "@/src/features/events/lib/eventsTablePaths";
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
  spanName?: string;
  webCallout?: {
    traceId: string | null;
    observationId?: string | null;
    sessionId?: string | null;
  };
  children: ComponentProps<typeof DropdownMenuController>["children"];
};

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
  spanName,
  webCallout,
  children,
}: DetailHeaderActionsMenuControllerProps) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
        </>
      )}
    >
      {children}
    </DropdownMenuController>
  );
}
