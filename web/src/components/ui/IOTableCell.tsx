import {
  JsonSkeleton,
  stringifyJsonNode,
  IO_TABLE_CHAR_LIMIT,
  JSONView,
} from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import { memo } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";

const IOTableCellContent = ({
  data,
  singleLine,
  className,
}: {
  data: unknown;
  singleLine: boolean;
  className?: string;
}) => {
  const stringifiedJson =
    data !== null && data !== undefined ? stringifyJsonNode(data) : undefined;

  // perf: truncate to IO_TABLE_CHAR_LIMIT characters as table becomes unresponsive attempting to render large JSONs with high levels of nesting
  const shouldTruncate =
    stringifiedJson && stringifiedJson.length > IO_TABLE_CHAR_LIMIT;

  return singleLine ? (
    <div
      className={cn(
        "h-full w-full self-stretch overflow-hidden overflow-y-auto truncate px-2 py-1",
        className,
      )}
    >
      {stringifiedJson
        ? decodeUnicodeEscapesOnly(stringifiedJson, true)
        : stringifiedJson}
    </div>
  ) : shouldTruncate ? (
    <div className="grid h-full grid-cols-1">
      <JSONView
        json={decodeUnicodeEscapesOnly(
          stringifiedJson.slice(0, IO_TABLE_CHAR_LIMIT) +
            `...[truncated ${stringifiedJson.length - IO_TABLE_CHAR_LIMIT} characters]`,
          true, // greedy mode for double-escaped Unicode (e.g., \\uXXXX)
        )}
        className={cn("h-full w-full self-stretch", className)}
        codeClassName="py-1 px-2 min-h-0 h-full overflow-y-auto"
        collapseStringsAfterLength={null} // in table, show full strings as row height is fixed
        borderless
      />
      <div className="text-xs text-muted-foreground">
        Content was truncated.
      </div>
    </div>
  ) : (
    <JSONView
      json={
        stringifiedJson ? decodeUnicodeEscapesOnly(stringifiedJson, true) : data
      }
      className={cn("h-full w-full self-stretch", className)}
      codeClassName="py-1 px-2 min-h-0 h-full overflow-y-auto"
      collapseStringsAfterLength={null} // in table, show full strings as row height is fixed
      borderless
    />
  );
};

export const IOTableCell = ({
  data,
  isLoading = false,
  className,
  singleLine = false,
  enableExpandOnHover = false,
}: {
  data: unknown;
  isLoading?: boolean;
  className?: string;
  singleLine?: boolean;
  enableExpandOnHover?: boolean;
}) => {
  if (isLoading) {
    return (
      <JsonSkeleton
        borderless
        className="h-full w-full overflow-hidden px-2 py-1"
      />
    );
  }

  if (!enableExpandOnHover) {
    return (
      <IOTableCellContent
        data={data}
        singleLine={singleLine}
        className={className}
      />
    );
  }

  return (
    <HoverCard openDelay={700} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="group/io-cell relative h-full w-full">
          <IOTableCellContent
            data={data}
            singleLine={singleLine}
            className={className}
          />
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        className="max-h-[40vh] w-[400px] overflow-y-auto"
        side="top"
        align="start"
      >
        <JSONView
          json={data}
          className="w-full"
          codeClassName="p-0 border-none"
        />
      </HoverCardContent>
    </HoverCard>
  );
};

export const MemoizedIOTableCell = memo(IOTableCell);
