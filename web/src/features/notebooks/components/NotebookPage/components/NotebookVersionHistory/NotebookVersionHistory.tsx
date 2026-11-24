import { History } from "@langfuse/icons";
import { format } from "date-fns";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/src/components/ui/sheet";
import { type RouterOutput } from "@/src/utils/types";

export function NotebookVersionHistory({
  view: { isDraft, notebookDirty, version, versions },
  onVersionChange,
}: {
  view: Pick<
    RouterOutput["notebooks"]["view"],
    "isDraft" | "notebookDirty" | "version" | "versions"
  >;
  onVersionChange: (version: number | null) => void;
}) {
  const versionHistory = [
    ...(notebookDirty || isDraft ? [{ number: null, publishedAt: null }] : []),
    ...versions,
  ];

  return (
    <Sheet>
      <Tooltip label="Version history" placement="bottom-end">
        {({ getTriggerProps }) => (
          <SheetTrigger asChild>
            <IconButton
              {...getTriggerProps()}
              icon={History}
              label="Version history"
            />
          </SheetTrigger>
        )}
      </Tooltip>
      <SheetContent
        className="ph-no-capture flex flex-col gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="h-12 shrink-0 justify-center border-b pr-12 pl-4 text-left">
          <SheetTitle className="text-base">Version history</SheetTitle>
        </SheetHeader>
        <ul
          aria-label="Notebook versions"
          className="min-h-0 space-y-0.5 overflow-y-auto p-2"
        >
          {versionHistory.map(({ number, publishedAt }) => (
            <li key={number ?? "draft"}>
              <button
                type="button"
                aria-current={number === version ? "true" : undefined}
                className="hover:bg-accent focus-visible:ring-ring aria-[current=true]:bg-accent flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm/5 focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset pointer-coarse:min-h-10"
                onClick={() => {
                  if (number !== version) onVersionChange(number);
                }}
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {number === null ? "Draft" : `Version ${number}`}
                  </span>
                  {publishedAt && (
                    <time
                      dateTime={publishedAt.toISOString()}
                      className="text-muted-foreground text-xs"
                    >
                      {format(publishedAt, "PPp")}
                    </time>
                  )}
                </span>
                {number === versions[0]?.number && (
                  <span className="text-muted-foreground shrink-0 self-start text-xs/5">
                    Latest
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
