import { Button } from "@/src/components/ui/button";
import { CopyIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { copyTextToClipboard } from "@/src/utils/clipboard";

interface IdItem {
  name: string;
  id: string;
}

export const CopyIdsPopover = ({
  idItems,
  className,
}: {
  idItems: IdItem[];
  className?: string;
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (textToCopy: string) => {
    copyTextToClipboard(textToCopy);
    setCopiedId(textToCopy);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // If only one idItem provided, use simple button with only one ID
  if (idItems.length === 1) {
    return (
      <Button
        variant="ghost"
        title="Copy ID"
        className={cn("h-fit p-1", className)}
        onClick={() => handleCopy(idItems[0].id)}
      >
        {copiedId === idItems[0].id ? (
          <CheckIcon className="h-3 w-3 text-muted-green" />
        ) : (
          <CopyIcon className="h-3 w-3" />
        )}
        <span className="ml-1 text-xs">ID</span>
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          title="Copy ID"
          className={cn("h-fit px-1", className)}
        >
          <CopyIcon className="h-3 w-3" />
          <span className="ml-1 text-xs">ID</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[50vh] w-auto min-w-[280px] overflow-y-auto p-1"
        align="start"
      >
        <div className="flex flex-col gap-0.5">
          {idItems.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {item.name}
                </span>
                <span
                  className="max-w-[220px] truncate font-mono text-xs"
                  title={item.id}
                >
                  {item.id}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                onClick={() => handleCopy(item.id)}
              >
                {copiedId === item.id ? (
                  <CheckIcon className="h-3 w-3 text-muted-green" />
                ) : (
                  <CopyIcon className="h-3 w-3" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
