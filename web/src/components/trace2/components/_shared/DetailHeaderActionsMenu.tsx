import { useRouter } from "next/router";
import { CheckIcon, CopyIcon, EllipsisVertical, Filter } from "lucide-react";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { buildEventsTablePathForSpanName } from "@/src/features/events/lib/eventsTablePaths";
import { copyTextToClipboard } from "@/src/utils/clipboard";

type IdItem = {
  name: string;
  id: string;
};

type DetailHeaderActionsMenuProps = {
  idItems: IdItem[];
  projectId: string;
  spanName?: string;
};

export function DetailHeaderActionsMenu({
  idItems,
  projectId,
  spanName,
}: DetailHeaderActionsMenuProps) {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Options"
          className="mt-0.5 flex-shrink-0"
          size="icon-xs"
          title="Options"
          variant="ghost"
        >
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {href && (
          <>
            <DropdownMenuItem onSelect={() => void router.push(href)}>
              <Filter className="mr-2 h-4 w-4" />
              <span className="max-w-[260px] truncate" title={spanName}>
                Filter observations by {spanName}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {idItems.map((item) => (
          <DropdownMenuItem key={item.id} onSelect={() => handleCopy(item.id)}>
            {copiedId === item.id ? (
              <CheckIcon className="mr-2 h-4 w-4 text-muted-green" />
            ) : (
              <CopyIcon className="mr-2 h-4 w-4" />
            )}
            <span className="max-w-[260px] truncate" title={item.id}>
              Copy {item.name}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
