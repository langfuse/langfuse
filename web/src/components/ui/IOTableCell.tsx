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

type IOTableCellPadding = "default" | "compact";

const ioTableCellPaddingClassNames: Record<IOTableCellPadding, string> = {
  default: "px-2 py-1",
  compact: "px-1 py-1",
};

const IOTableCellContent = ({
  data,
  singleLine,
  className,
  padding,
}: {
  data: unknown;
  singleLine: boolean;
  className?: string;
  padding: IOTableCellPadding;
}) => {
  const stringifiedJson =
    data !== null && data !== undefined ? stringifyJsonNode(data) : undefined;
  const paddingClassName = ioTableCellPaddingClassNames[padding];

  // perf: truncate to IO_TABLE_CHAR_LIMIT characters as table becomes unresponsive attempting to render large JSONs with high levels of nesting
  const shouldTruncate =
    stringifiedJson && stringifiedJson.length > IO_TABLE_CHAR_LIMIT;

  const singleLineText = stringifiedJson
    ? decodeUnicodeEscapesOnly(stringifiedJson, true)
    : stringifiedJson;

  return singleLine ? (
    <div
      className={cn(
        "h-full w-full self-stretch truncate overflow-hidden overflow-y-auto rounded-sm",
        paddingClassName,
        className,
      )}
      title={singleLineText}
    >
      {singleLineText}
    </div>
  ) : shouldTruncate ? (
    <div className="grid h-full grid-cols-1">
      <JSONView
        json={decodeUnicodeEscapesOnly(
          stringifiedJson.slice(0, IO_TABLE_CHAR_LIMIT) +
            `...[truncated ${stringifiedJson.length - IO_TABLE_CHAR_LIMIT} characters]`,
          true, // greedy mode for double-escaped Unicode (e.g., \\uXXXX)
        )}
        className={cn(
          "h-full w-full self-stretch overflow-hidden rounded-sm",
          className,
        )}
        codeClassName={cn("min-h-0 h-full overflow-y-auto", paddingClassName)}
        collapseStringsAfterLength={null} // in table, show full strings as row height is fixed
        borderless
      />
      <div className="text-muted-foreground text-xs">
        Content was truncated.
      </div>
    </div>
  ) : (
    <JSONView
      json={
        stringifiedJson ? decodeUnicodeEscapesOnly(stringifiedJson, true) : data
      }
      className={cn(
        "h-full w-full self-stretch overflow-hidden rounded-sm",
        className,
      )}
      codeClassName={cn("min-h-0 h-full overflow-y-auto", paddingClassName)}
      collapseStringsAfterLength={null} // in table, show full strings as row height is fixed
      borderless
    />
  );
};

export const IOTableCell = ({
  data,
  isLoading = false,
  className,
  padding = "default",
  singleLine = false,
  enableExpandOnHover = false,
}: {
  data: unknown;
  isLoading?: boolean;
  className?: string;
  padding?: IOTableCellPadding;
  singleLine?: boolean;
  enableExpandOnHover?: boolean;
}) => {
  const paddingClassName = ioTableCellPaddingClassNames[padding];

  if (isLoading) {
    return (
      <JsonSkeleton
        borderless
        numRows={singleLine ? 1 : undefined}
        className={cn(
          "h-full w-full overflow-hidden rounded-sm",
          paddingClassName,
          className,
        )}
      />
    );
  }

  if (!enableExpandOnHover) {
    return (
      <IOTableCellContent
        data={data}
        singleLine={singleLine}
        className={className}
        padding={padding}
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
            padding={padding}
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
