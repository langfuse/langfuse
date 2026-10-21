import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  type IconComponent,
} from "@langfuse/icons";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { cn } from "@/src/utils/tailwind";

/** An icon button in the section header. */
export type IOSectionAction = {
  icon: IconComponent;
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

/** A segmented switch in the header, always visible while the section is open. */
type IOSectionTabs = {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string; count?: number }[];
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
  titleIcon?: IconComponent;
  /** Count badge after the title. */
  count?: number;
  info?: IOSectionInfo;
  /** Header copy control; omitted when the section has nothing to copy. */
  onCopy?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  actions?: IOSectionAction[];
  status?: IOSectionStatus;
  toggle?: IOSectionToggle;
  /** Primary view switch for the body; hidden while collapsed. */
  tabs?: IOSectionTabs;
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

/** Toned text boxes (status messages); same colours as StatusMessage. */
const TONE_TEXT_CLASSES: Record<IOSectionTone, string> = {
  danger:
    "border border-red-100 bg-red-50 text-red-900 dark:border-dark-red/20 dark:bg-light-red/35 dark:text-red-300",
  warning:
    "border border-yellow-100 bg-yellow-50 text-yellow-900 dark:border-dark-yellow/20 dark:bg-light-yellow/35 dark:text-yellow-300",
  muted: "bg-surface-section text-foreground-secondary",
  neutral: "bg-surface-section text-foreground-secondary",
};

/** Toned table boxes: the plain table box with the tone as its fill only. */
const TONE_FILL_CLASSES: Record<IOSectionTone, string> = {
  danger: "bg-red-50 dark:bg-light-red/35",
  warning: "bg-yellow-50 dark:bg-light-yellow/35",
  muted: "bg-surface-section",
  neutral: "bg-surface-section",
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
    return cn(
      "overflow-hidden rounded-md px-3",
      BODY_PADDING_CLASSES.table,
      TONE_FILL_CLASSES[tone],
    );
  }
  return cn(
    "rounded-md px-3 py-2 text-sm wrap-break-word whitespace-pre-wrap",
    TONE_TEXT_CLASSES[tone],
  );
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
  info,
  onCopy,
  actions,
  status,
  toggle,
  tabs,
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
          <Caret size="base" color="default" aria-hidden />
          {TitleIcon ? (
            <TitleIcon size="base" color="default" aria-hidden />
          ) : null}
          {title}
          {count !== undefined ? (
            <Badge color="filled" size="sm" text={String(count)} />
          ) : null}
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
        {tabs && !isCollapsed ? (
          <div className="flex shrink-0 items-center pr-1 font-normal normal-case">
            <Tabs value={tabs.value} onValueChange={tabs.onValueChange}>
              <Tabs.List variant="inset" size="sm">
                {tabs.items.map((item) => (
                  <Tabs.Trigger
                    key={item.value}
                    value={item.value}
                    label={item.label}
                    count={item.count}
                  />
                ))}
              </Tabs.List>
            </Tabs>
          </div>
        ) : null}
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
          {action.active ? (
            <action.icon size="base" __rawClassName="text-primary" />
          ) : (
            <action.icon size="base" color="default" />
          )}
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
            <Check size="base" color="default" />
          ) : (
            <Copy size="base" color="default" />
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
      {status.kind === "saving" ? <Spinner size="xxs" /> : <Check size="sm" />}
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
          <Info size="base" />
        </button>
      )}
    </HoverCard>
  );
}

// Hosts that draw their own header (the compact JSON Beta variant) reuse the
// section's control rendering.
IOSection.Controls = IOSectionControls;
IOSection.InfoButton = IOSectionInfoButton;
