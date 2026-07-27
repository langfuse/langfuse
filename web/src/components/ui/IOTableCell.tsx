import {
  JsonSkeleton,
  stringifyJsonNode,
  IO_TABLE_CHAR_LIMIT,
  JSONView,
} from "@/src/components/ui/CodeJsonViewer";
import { splitStringByMediaReferences } from "@/src/components/ui/media/mediaUtils";
import { JsonMediaTag } from "@/src/components/ui/media/JsonMediaTag";
import { cn } from "@/src/utils/tailwind";
import { memo, useRef, useState } from "react";
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

function renderStringWithMediaReferences(value: string) {
  // Copy the segments: the quote-trim below mutates `value` in place, and the
  // originals belong to splitStringByMediaReferences (unsafe to mutate if it
  // ever memoizes its result).
  const segments = splitStringByMediaReferences(value).map((segment) => ({
    ...segment,
  }));

  if (segments.length === 1 && segments[0]?.type === "text") {
    return value;
  }

  // JSON.stringify wraps media reference strings in quotes (both nested in
  // stringified JSON and as a lone compact-verbosity value), which would
  // render as a quoted chip — while the multi-line JSON view shows a bare
  // chip. Drop a quote pair that directly encloses a chip; the escaped-quote
  // check leaves a literal \" in user text alone.
  segments.forEach((segment, index) => {
    if (segment.type !== "media") return;
    const prev = segments[index - 1];
    const next = segments[index + 1];
    if (
      prev?.type === "text" &&
      next?.type === "text" &&
      prev.value.endsWith('"') &&
      !prev.value.endsWith('\\"') &&
      next.value.startsWith('"')
    ) {
      prev.value = prev.value.slice(0, -1);
      next.value = next.value.slice(1);
    }
  });

  return segments.map((segment, index) =>
    segment.type === "media" ? (
      <JsonMediaTag
        key={`${segment.value}-${index}`}
        descriptor={segment.descriptor}
      />
    ) : (
      segment.value
    ),
  );
}

const IOTableCellContent = ({
  data,
  singleLine,
  className,
  padding,
  suppressTitle = false,
}: {
  data: unknown;
  singleLine: boolean;
  className?: string;
  padding: IOTableCellPadding;
  suppressTitle?: boolean;
}) => {
  const stringifiedJson =
    data !== null && data !== undefined ? stringifyJsonNode(data) : undefined;
  const paddingClassName = ioTableCellPaddingClassNames[padding];

  // Native title tooltips render on top of open popovers, so the single-line
  // title is dropped whenever a hover surface supersedes it: entirely when the
  // cell has an expand-on-hover card (which previews the same content), and
  // while the pointer is over a media chip (which has its own hover peek).
  const [isPointerOverMediaTag, setIsPointerOverMediaTag] = useState(false);

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
      title={
        suppressTitle || isPointerOverMediaTag ? undefined : singleLineText
      }
      // With suppressTitle the state cannot affect output, so skip the
      // handler to avoid re-rendering on every chip-boundary crossing.
      onPointerOver={
        suppressTitle
          ? undefined
          : (event) =>
              setIsPointerOverMediaTag(
                Boolean((event.target as Element).closest("[data-media-tag]")),
              )
      }
    >
      {singleLineText ? renderStringWithMediaReferences(singleLineText) : null}
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

  // Media chips inside the cell carry their own hover peek; opening the
  // cell-wide expand card on top of it stacks two popovers. Track whether the
  // pointer is over a chip and keep the expand card closed for that region —
  // hover a chip for the media peek, hover anywhere else for the full JSON.
  const [isExpandOpen, setIsExpandOpen] = useState(false);
  const isPointerOverMediaTag = useRef(false);

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
    <HoverCard
      openDelay={700}
      closeDelay={100}
      open={isExpandOpen}
      onOpenChange={(open) => {
        if (open && isPointerOverMediaTag.current) return;
        setIsExpandOpen(open);
      }}
    >
      <HoverCardTrigger asChild>
        <div
          className="group/io-cell relative h-full w-full"
          onPointerOver={(event) => {
            const overMediaTag = Boolean(
              (event.target as Element).closest("[data-media-tag]"),
            );
            isPointerOverMediaTag.current = overMediaTag;
            if (overMediaTag) setIsExpandOpen(false);
          }}
        >
          <IOTableCellContent
            data={data}
            singleLine={singleLine}
            className={className}
            padding={padding}
            suppressTitle
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
