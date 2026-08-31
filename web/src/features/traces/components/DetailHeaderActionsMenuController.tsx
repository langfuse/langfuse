import { useRouter } from "next/router";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
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
import { WebCalloutMenuItem } from "@/src/features/web-callouts/components/WebCalloutMenuItem";

export type DetailHeaderIdItem = {
  name: string;
  id: string;
};

type ConnectedDetailHeaderActionsMenuControllerProps = {
  idItems: DetailHeaderIdItem[];
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

export function ConnectedDetailHeaderActionsMenuController({
  idItems,
  observationType,
  projectId,
  spanName,
  webCallout,
  children,
}: ConnectedDetailHeaderActionsMenuControllerProps) {
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
    <DetailHeaderActionsMenuController
      idItems={idItems}
      copiedId={copiedId}
      onCopy={handleCopy}
      filterItems={[
        ...(href && spanName
          ? [{ href, label: `name:${spanName}`, title: spanName }]
          : []),
        ...(typeHref && filterTypeLabel
          ? [
              {
                href: typeHref,
                label: filterTypeLabel,
                title: filterTypeLabel,
              },
            ]
          : []),
      ]}
      onNavigate={(href) => router.push(href)}
      webCallout={
        webCallout ? (
          <WebCalloutMenuItem
            projectId={projectId}
            traceId={webCallout.traceId}
            observationId={webCallout.observationId}
            sessionId={webCallout.sessionId}
            withSeparator
          />
        ) : null
      }
    >
      {children}
    </DetailHeaderActionsMenuController>
  );
}

export function DetailHeaderActionsMenuController({
  idItems,
  copiedId,
  onCopy,
  filterItems,
  onNavigate,
  webCallout,
  children,
}: {
  idItems: DetailHeaderIdItem[];
  copiedId: string | null;
  onCopy: (id: string) => void;
  filterItems: { href: string; label: string; title: string }[];
  onNavigate: (href: string) => void;
  webCallout: React.ReactNode;
  children: ComponentProps<typeof DropdownMenuController>["children"];
}) {
  return (
    <DropdownMenuController
      align="start"
      renderMenu={() => (
        <>
          {webCallout}
          {filterItems.length > 0 && (
            <>
              {filterItems.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  className="text-xs"
                  onSelect={() => onNavigate(item.href)}
                >
                  <span className="max-w-[260px] truncate" title={item.title}>
                    filter by <span className="font-bold">{item.label}</span>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          {idItems.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="text-xs"
              onSelect={() => onCopy(item.id)}
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
