import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Expand, ExternalLink } from "lucide-react";
import { Separator } from "@/src/components/ui/separator";
import { ItemBadge } from "@/src/components/ItemBadge";

type DataTablePeekViewProps<TData> = {
  selectedRowId: string | null;
  onOpenChange: (open: boolean, row?: TData) => void;
  onExpand: (openInNewTab: boolean) => void;
  render: () => React.ReactNode;
};

// TODO: ideally include name of the row in the header
// TODO: include detail view navigation
export function TablePeekView<TData>({
  selectedRowId,
  onOpenChange,
  onExpand,
  render,
}: DataTablePeekViewProps<TData>) {
  return (
    <Sheet open={!!selectedRowId} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="flex min-w-[60vw] flex-col gap-0 rounded-l-xl p-0"
      >
        <SheetHeader className="flex min-h-12 flex-row justify-between rounded-t-xl bg-header px-2">
          <SheetTitle className="!mt-0 ml-2 flex flex-row items-center gap-2">
            <ItemBadge type="TRACE" showLabel />
            <span className="text-sm font-medium">{selectedRowId}</span>
          </SheetTitle>
          <div className="!mt-0 mr-6 flex h-full flex-row items-center border-l">
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
        </SheetHeader>
        <Separator />
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-auto">{render()}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
