/* eslint-disable boundaries/dependencies */
import {
  JsonSkeleton,
  stringifyJsonNode,
  IO_TABLE_CHAR_LIMIT,
  JSONView,
} from "@/src/components/ui/CodeJsonViewer";
import {
  splitStringByMediaReferences,
  type MediaDescriptor,
} from "@/src/components/ui/media/mediaUtils";
import { cn } from "@/src/utils/tailwind";
import { Fragment, memo, useRef, useState, type ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";

export type IOTableCellVariant = "default" | "input" | "output";
type IOTableCellSize = "default" | "compact";
export type IOTableCellMediaRenderer = (
  descriptor: MediaDescriptor,
) => ReactNode;

const ioTableCellVariantClassNames: Record<IOTableCellVariant, string> = {
  default: "",
  input: "bg-muted/50",
  output: "bg-accent-light-green",
};

const ioTableCellPaddingClassNames: Record<IOTableCellSize, string> = {
  default: "px-2 py-1",
  compact: "px-1 py-1",
};

type IOTableCellPresentationProps = {
  enableExpandOnHover?: boolean;
  singleLine?: boolean;
  size?: IOTableCellSize;
  variant?: IOTableCellVariant;
};

type IOTableCellState =
  | {
      /** Ingested IO is intentionally untrusted; stringifyJsonNode safely normalizes arbitrary values. */
      data: unknown;
      isLoading?: false;
    }
  | { data?: never; isLoading: true };

type IOTableCellProps = IOTableCellPresentationProps &
  IOTableCellState & {
    /** Injected so the base component stays API-free and Storybook can provide a pure renderer. */
    renderMediaReference: IOTableCellMediaRenderer;
  };

function renderStringWithMediaReferences(
  value: string,
  renderMediaReference: IOTableCellProps["renderMediaReference"],
) {
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
      <Fragment key={`${segment.value}-${index}`}>
        {renderMediaReference(segment.descriptor)}
      </Fragment>
    ) : (
      segment.value
    ),
  );
}

export const IOTableCell = memo(function IOTableCell({
  enableExpandOnHover = false,
  // Inject media rendering so this component stays independent of the tRPC-backed resolver
  renderMediaReference,
  singleLine = false,
  size = "default",
  variant = "default",
  ...state
}: IOTableCellProps) {
  const paddingClassName = ioTableCellPaddingClassNames[size];
  const variantClassName = ioTableCellVariantClassNames[variant];

  // Media chips inside the cell carry their own hover peek; opening the
  // cell-wide expand card on top of it stacks two popovers. Track whether the
  // pointer is over a chip and keep the expand card closed for that region —
  // hover a chip for the media peek, hover anywhere else for the full JSON.
  const [isExpandOpen, setIsExpandOpen] = useState(false);
  const [isPointerOverMediaTag, setIsPointerOverMediaTag] = useState(false);
  const isPointerOverMediaTagRef = useRef(false);

  if (state.isLoading) {
    return (
      <JsonSkeleton
        borderless
        numRows={singleLine ? 1 : undefined}
        className={cn(
          "h-full w-full overflow-hidden rounded-sm",
          paddingClassName,
          variantClassName,
        )}
      />
    );
  }

  const { data } = state;
  const stringifiedJson =
    data !== null && data !== undefined ? stringifyJsonNode(data) : undefined;
  const shouldTruncate =
    stringifiedJson && stringifiedJson.length > IO_TABLE_CHAR_LIMIT;
  const singleLineText = stringifiedJson
    ? decodeUnicodeEscapesOnly(stringifiedJson, true)
    : stringifiedJson;

  let content: ReactNode;
  if (singleLine) {
    content = (
      <div
        className={cn(
          "ph-no-capture h-full w-full self-stretch truncate overflow-hidden overflow-y-auto rounded-sm",
          paddingClassName,
          variantClassName,
        )}
        title={
          enableExpandOnHover || isPointerOverMediaTag
            ? undefined
            : singleLineText
        }
        onPointerOver={
          enableExpandOnHover
            ? undefined
            : (event) =>
                setIsPointerOverMediaTag(
                  Boolean(
                    (event.target as Element).closest("[data-media-tag]"),
                  ),
                )
        }
      >
        {singleLineText
          ? renderStringWithMediaReferences(
              singleLineText,
              renderMediaReference,
            )
          : null}
      </div>
    );
  } else if (shouldTruncate) {
    content = (
      <div className="grid h-full grid-cols-1">
        <JSONView
          json={decodeUnicodeEscapesOnly(
            stringifiedJson.slice(0, IO_TABLE_CHAR_LIMIT) +
              `...[truncated ${stringifiedJson.length - IO_TABLE_CHAR_LIMIT} characters]`,
            true,
          )}
          className={cn(
            "h-full w-full self-stretch overflow-hidden rounded-sm",
            variantClassName,
          )}
          codeClassName={cn("min-h-0 h-full overflow-y-auto", paddingClassName)}
          collapseStringsAfterLength={null}
          borderless
        />
        <div className="text-muted-foreground text-xs">
          Content was truncated.
        </div>
      </div>
    );
  } else {
    content = (
      <JSONView
        json={
          stringifiedJson
            ? decodeUnicodeEscapesOnly(stringifiedJson, true)
            : data
        }
        className={cn(
          "h-full w-full self-stretch overflow-hidden rounded-sm",
          variantClassName,
        )}
        codeClassName={cn("min-h-0 h-full overflow-y-auto", paddingClassName)}
        collapseStringsAfterLength={null}
        borderless
      />
    );
  }

  if (!enableExpandOnHover) {
    return content;
  }

  return (
    <HoverCard
      openDelay={700}
      closeDelay={100}
      open={isExpandOpen}
      onOpenChange={(open) => {
        if (open && isPointerOverMediaTagRef.current) return;
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
            isPointerOverMediaTagRef.current = overMediaTag;
            if (overMediaTag) setIsExpandOpen(false);
          }}
        >
          {content}
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        className="ph-no-capture max-h-[40vh] w-[400px] overflow-y-auto"
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
});
