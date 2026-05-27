import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  getTraceMetadataFilterValue,
  type TraceMetadataFilterHandler,
} from "@/src/components/trace/lib/trace-metadata-filter";
import { EllipsisVertical } from "lucide-react";

function truncateMenuValue(value: string) {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

export function TraceMetadataFilterMenu({
  metadataKey,
  metadataValue,
  onTraceMetadataFilter,
}: {
  metadataKey: string;
  metadataValue: unknown;
  onTraceMetadataFilter?: TraceMetadataFilterHandler;
}) {
  const filterValue = getTraceMetadataFilterValue(metadataValue);

  if (!onTraceMetadataFilter || filterValue === null || !metadataKey.trim()) {
    return null;
  }

  const label = `metadata.${metadataKey}:${truncateMenuValue(filterValue)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-4 w-4 shrink-0 rounded-sm p-0"
          title={`Options for metadata ${metadataKey}`}
          aria-label={`Options for metadata ${metadataKey}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem
          className="text-xs"
          onClick={(event) => {
            event.stopPropagation();
            onTraceMetadataFilter({
              key: metadataKey,
              value: metadataValue,
            });
          }}
        >
          <span className="max-w-[260px] truncate" title={label}>
            filter by <span className="font-semibold">{label}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function shouldShowTraceMetadataFilterMenu({
  metadataKey,
  metadataValue,
  onTraceMetadataFilter,
}: {
  metadataKey: string;
  metadataValue: unknown;
  onTraceMetadataFilter?: TraceMetadataFilterHandler;
}) {
  return Boolean(
    onTraceMetadataFilter &&
    getTraceMetadataFilterValue(metadataValue) !== null &&
    metadataKey.trim(),
  );
}
