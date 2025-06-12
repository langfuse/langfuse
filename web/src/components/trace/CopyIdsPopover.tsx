import { Button } from "@/src/components/ui/button";
import { CopyIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { Label } from "@/src/components/ui/label";
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
        className="max-h-[50vh] w-auto min-w-[300px] overflow-y-auto p-0"
        align="start"
      >
        <Label className="p-2 text-base capitalize">Copy IDs</Label>
        <div className="bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col">
            {idItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b p-2 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-muted-foreground">
                    {item.name}
                  </span>
                  <div className="flex items-center">
                    <span
                      className="mr-2 max-w-[250px] truncate font-mono text-sm"
                      title={item.id}
                    >
                      {item.id}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
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
        </div>
      </PopoverContent>
    </Popover>
  );
};
