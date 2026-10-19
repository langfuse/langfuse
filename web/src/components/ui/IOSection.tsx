import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ObservationLevelType } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { statusMessageVariants } from "@/src/components/design-system/StatusMessage/StatusMessage";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { cn } from "@/src/utils/tailwind";

/** An icon button in the section header. */
export type IOSectionAction = {
  icon: LucideIcon;
  /** Tooltip and accessible name. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Highlights the icon while the action's mode is on. */
  active?: boolean;
};

/** A short state label in the header, before the actions. */
export type IOSectionStatus = {
  kind: "saving" | "saved" | "error";
  text: string;
};

/** A labelled switch at the end of the header controls. */
export type IOSectionToggle = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** An info hover card after the title. */
export type IOSectionInfo = {
  /** Accessible name of the info trigger. */
  label: string;
  text: string;
  /** Appends "Learn more in the documentation." linking here. */
  docsHref?: string;
};

export type IOSectionTone = "danger" | "warning" | "muted" | "neutral";

export type IOSectionProps = {
  title: string;
  titleIcon?: LucideIcon;
  /** Count badge after the title. */
  count?: number;
  /** Marks a beta feature with a badge after the title. */
  beta?: boolean;
  info?: IOSectionInfo;
  /** Header copy control; omitted when the section has nothing to copy. */
  onCopy?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  actions?: IOSectionAction[];
  status?: IOSectionStatus;
  toggle?: IOSectionToggle;
  /** Initial state of an uncontrolled section. */
  defaultCollapsed?: boolean;
  /** Controlled state; the header calls `onCollapsedChange`. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Body box: `text` (default inset), `table` for rows that carry their own
      padding, `media` for tiles that want the same inset on every side. */
  variant?: "text" | "table" | "media";
  /** Level-coloured box (status messages, toned tables). */
  tone?: IOSectionTone;
  children: React.ReactNode;
};

const BODY_PADDING_CLASSES: Record<
  NonNullable<IOSectionProps["variant"]>,
  string
> = {
  text: "py-2",
  table: "py-1",
  media: "py-3",
};

const TONE_LEVEL: Record<IOSectionTone, ObservationLevelType> = {
  danger: "ERROR",
  warning: "WARNING",
  muted: "DEFAULT",
  neutral: "DEFAULT",
};

/** Toned table boxes: the table's hairlines sit inside a level-coloured frame. */
const TONE_TABLE_CLASSES: Record<IOSectionTone, string> = {
  danger:
    "border-red-100 bg-red-50 text-red-900 dark:border-dark-red/20 dark:bg-light-red/35 dark:text-red-300",
  warning:
    "border-yellow-100 bg-yellow-50 text-yellow-900 dark:border-dark-yellow/20 dark:bg-light-yellow/35 dark:text-yellow-300",
  muted: "border-transparent text-foreground-secondary",
  neutral: "border-transparent text-foreground-secondary",
};

/** The body box: the section's grey fill, or a level-coloured frame. */
function boxClasses(
  variant: NonNullable<IOSectionProps["variant"]>,
  tone: IOSectionTone | undefined,
) {
  if (!tone) {
    return cn(
      "bg-surface-section overflow-hidden rounded-md px-3",
      BODY_PADDING_CLASSES[variant],
    );
  }
  if (variant === "table") {
    return cn("overflow-hidden rounded-sm border", TONE_TABLE_CLASSES[tone]);
  }
  return statusMessageVariants({ level: TONE_LEVEL[tone], size: "compact" });
}

const HEADER_CONTROL_CLASSES =
  "text-muted-foreground hover:text-foreground hover:bg-transparent";

/**
 * One I/O section of the trace view: a header row (caret, title, hover
 * controls) over a boxed body. The header row toggles the body (its controls
 * do not); a collapsed section is just the header row and does not render
 * its children.
 */
export function IOSection({
  title,
  titleIcon: TitleIcon,
  count,
  beta = false,
  info,
  onCopy,
  actions,
  status,
  toggle,
  defaultCollapsed = false,
  collapsed,
  onCollapsedChange,
  variant = "text",
  tone,
  children,
}: IOSectionProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? internalCollapsed;
  const Caret = isCollapsed ? ChevronRight : ChevronDown;

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    if (onCollapsedChange) {
      onCollapsedChange(next);
    } else {
      setInternalCollapsed(next);
    }
  };

  return (
    // overflow-clip (not hidden) so the sticky header can track the panel scroll.
    <div className="group/iosection flex flex-col overflow-clip">
      <div className="io-message-header flex h-8 flex-row items-center justify-between px-0 text-sm font-bold capitalize">
        {/* Masked from session recordings: the title can be a customer-provided
            message `name` (or tool name) rather than a fixed role string. */}
        <button
          type="button"
          className="ph-no-capture focus-visible:ring-ring flex h-full min-w-0 shrink cursor-pointer items-center gap-2 rounded-sm text-left capitalize focus-visible:ring-2 focus-visible:outline-hidden"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${title}`}
          onClick={toggleCollapsed}
        >
          <Caret
            className="icon-base text-icon-foreground shrink-0"
            aria-hidden
          />
          {TitleIcon ? (
            <TitleIcon
              className="icon-base text-icon-foreground shrink-0"
              aria-hidden
            />
          ) : null}
          {title}
          {count !== undefined ? (
            <Badge color="filled" size="sm" text={String(count)} />
          ) : null}
          {beta ? <Badge text="Beta" color="blue" size="sm" /> : null}
        </button>
        {info ? (
          <div className="flex items-center pl-2">
            <IOSectionInfoButton info={info} />
          </div>
        ) : null}
        {/* The rest of the row toggles too; the title button carries the
            accessible name and state, so this hit area stays out of the tree. */}
        <button
          type="button"
          className="h-full min-w-0 flex-1 cursor-pointer"
          aria-hidden
          tabIndex={-1}
          onClick={toggleCollapsed}
        />
        <div
          className={cn(
            "mr-1 flex shrink-0 flex-row items-center gap-1",
            // pointer-coarse: touch devices have no hover, so the controls
            // stay visible there instead of being unreachable.
            "opacity-0 transition-opacity group-hover/iosection:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          {/* A collapsed section offers nothing to copy or act on. */}
          {!isCollapsed ? (
            <IOSectionControls
              status={status}
              actions={actions}
              toggle={toggle}
              onCopy={onCopy}
            />
          ) : null}
        </div>
      </div>
      {!isCollapsed && (
        <div className="io-message-content ph-no-capture pt-1">
          <div className={boxClasses(variant, tone)}>{children}</div>
        </div>
      )}
    </div>
  );
}

/** The header's right-hand controls, in order: status, actions, toggle, copy. */
function IOSectionControls({
  status,
  actions,
  toggle,
  onCopy,
}: Pick<IOSectionProps, "status" | "actions" | "toggle" | "onCopy">) {
  const [isCopied, setIsCopied] = useState(false);

  return (
    <>
      {status ? <StatusLabel status={status} /> : null}
      {actions?.map((action) => (
        <Button
          key={action.label}
          variant="ghost"
          size="icon-xs"
          type="button"
          title={action.label}
          aria-label={action.label}
          disabled={action.disabled}
          onClick={action.onClick}
          className={HEADER_CONTROL_CLASSES}
        >
          <action.icon
            className={cn(
              "icon-base",
              action.active ? "text-primary" : "text-icon-foreground",
            )}
          />
        </Button>
      ))}
      {toggle ? (
        <div className="flex items-center">
          <div className="mx-1">
            <Switch
              checked={toggle.checked}
              onCheckedChange={toggle.onCheckedChange}
              disabled={toggle.disabled}
              size="sm"
            />
          </div>
          <span className="text-muted-foreground text-xs">{toggle.label}</span>
        </div>
      ) : null}
      {onCopy ? (
        <Button
          title="Copy to clipboard"
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={(event) => {
            setIsCopied(true);
            onCopy(event);
            setTimeout(() => setIsCopied(false), 1000);
          }}
          className={HEADER_CONTROL_CLASSES}
        >
          {isCopied ? (
            <Check className="icon-base text-icon-foreground" />
          ) : (
            <Copy className="icon-base text-icon-foreground" />
          )}
        </Button>
      ) : null}
    </>
  );
}

/** Saving / saved / error label; `pr-2` keeps its gap to the actions. */
function StatusLabel({ status }: { status: IOSectionStatus }) {
  if (status.kind === "error") {
    return <span className="pr-2 text-xs text-red-500">{status.text}</span>;
  }
  return (
    <div className="flex items-center gap-1 pr-2">
      {status.kind === "saving" ? (
        <Spinner size="xxs" />
      ) : (
        <Check className="icon-sm" />
      )}
      <span className="text-muted-foreground text-xs">{status.text}</span>
    </div>
  );
}

/** Info trigger with a hover card; sits outside the title toggle. */
function IOSectionInfoButton({ info }: { info: IOSectionInfo }) {
  return (
    <HoverCard
      placement="right"
      content={
        <div className="w-80 p-3 text-xs">
          <p>
            {info.text}
            {info.docsHref ? (
              <>
                {" "}
                Learn more in the{" "}
                <Link
                  href={info.docsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground underline"
                >
                  documentation
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          aria-label={info.label}
          className="text-muted-foreground hover:text-foreground"
          {...getTriggerProps()}
        >
          <Info className="icon-base" />
        </button>
      )}
    </HoverCard>
  );
}

// Hosts that draw their own header (the compact JSON Beta variant) reuse the
// section's control rendering.
IOSection.Controls = IOSectionControls;
IOSection.InfoButton = IOSectionInfoButton;
