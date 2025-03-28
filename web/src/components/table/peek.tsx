import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Expand, ExternalLink } from "lucide-react";
import { Separator } from "@/src/components/ui/separator";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";

type PeekViewItemType = Extract<LangfuseItemType, "TRACE">;

export type DataTablePeekViewProps<TData> = {
  itemType: PeekViewItemType;
  selectedRowId: string | null;
  onOpenChange: (open: boolean, row?: TData) => void;
  onExpand: (openInNewTab: boolean) => void;
  render: () => React.ReactNode;
  urlPathname: string;
};

const mapItemTypeToPageUrl: Record<PeekViewItemType, string> = {
  TRACE: "traces",
} as const;

export function TablePeekView<TData>({
  itemType,
  selectedRowId,
  onOpenChange,
  onExpand,
  render,
  urlPathname,
}: DataTablePeekViewProps<TData>) {
  const pageUrl = mapItemTypeToPageUrl[itemType];

  return (
    <Sheet
      open={!!selectedRowId}
      onOpenChange={(open) => {
        // Ignore close events from checkbox or bookmark star toggle clicks to ensure integrity of table row actions
        if (
          !open &&
          (document.activeElement?.closest('[role="checkbox"]') ||
            document.activeElement?.closest('[aria-label="bookmark"]'))
        ) {
          return;
        }
        onOpenChange(open);
      }}
      modal={false}
    >
      <SheetContent
        onPointerDownOutside={(e) => {
          // Prevent the default behavior of closing when clicking outside when we set modal={false}
          e.preventDefault();
        }}
        side="right"
        className="flex max-h-full min-h-0 min-w-[60vw] flex-col gap-0 overflow-hidden rounded-l-xl p-0"
      >
        <SheetHeader className="flex min-h-12 flex-row justify-between rounded-t-xl bg-header px-2">
          <SheetTitle className="!mt-0 ml-2 flex flex-row items-center gap-2">
            <ItemBadge type={itemType} showLabel />
            <span
              className="text-sm font-medium focus:outline-none"
              tabIndex={0}
            >
              {selectedRowId}
            </span>
          </SheetTitle>
          <div className="!mt-0 flex flex-row items-center gap-2">
            {selectedRowId && (
              <DetailPageNav
                currentId={selectedRowId}
                path={(entry) => {
                  const url = new URL(window.location.href);

                  // Update the path part
                  url.pathname = urlPathname;

                  // Keep all existing query params
                  const params = new URLSearchParams(url.search);

                  // Update timestamp if it exists in entry.params
                  if (entry.params) {
                    if (entry.params.timestamp)
                      params.set(
                        "timestamp",
                        encodeURIComponent(entry.params.timestamp),
                      );
                    params.delete("observation");
                  }

                  // Update peek param to the new id
                  params.set("peek", entry.id);

                  // Set the search part of the URL
                  return `${url.pathname}?${params.toString()}`;
                }}
                listKey={pageUrl}
              />
            )}
            <div className="!mt-0 mr-8 flex h-full flex-row items-center gap-1 border-l">
              <Button
                variant="ghost"
                size="icon-xs"
                title="Open in current tab"
                className="ml-2"
                onClick={() => onExpand(false)}
              >
                <Expand className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Open in new tab"
                onClick={() => onExpand(true)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>
        <Separator />
        <div className="flex max-h-full min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto">{render()}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
