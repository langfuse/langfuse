import {
  Bot,
  CheckCircle2,
  CircleHelp,
  Hash,
  ListChecks,
  Loader2,
  MessagesSquare,
  ToggleLeft,
  Type as TextIcon,
  User,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { ScoreDataTypeType } from "@langfuse/shared";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { cn } from "@/src/utils/tailwind";

export type InAppAgentResourceReferencePresentation = "inline" | "row";

type ResourceReferenceStateProps = {
  id: string;
  label?: ReactNode;
  presentation: InAppAgentResourceReferencePresentation;
};

type LoadedResourceReferenceStateProps<TResource> =
  ResourceReferenceStateProps & {
    href?: string;
    resource: TResource;
    state: "loaded";
  };

type PendingResourceReferenceStateProps = ResourceReferenceStateProps & {
  state: "loading" | "unavailable";
};

type ResourceReferenceMetadata = {
  icon?: ReactNode;
  label: string;
  title?: string;
};

export type InAppAgentResourceReferenceTraceProps =
  | LoadedResourceReferenceStateProps<unknown>
  | PendingResourceReferenceStateProps;

export function InAppAgentResourceReferenceTrace(
  props: InAppAgentResourceReferenceTraceProps,
) {
  if (props.state !== "loaded") {
    return renderPendingResourceReference({ ...props, type: "trace" });
  }

  const title =
    getStringField(props.resource, "name") ??
    getLabelText(props.label) ??
    "Trace reference";
  const environment = getStringField(props.resource, "environment");
  const userId = getStringField(props.resource, "userId");
  const sessionId = getStringField(props.resource, "sessionId");
  const observationCount = getArrayField(
    props.resource,
    "observations",
  )?.length;
  const metadata = compact([
    formatDateMetadata(getDateField(props.resource, "timestamp")),
    props.presentation === "row"
      ? formatCountMetadata(observationCount, "observation")
      : undefined,
    optionalMetadata(environment),
    props.presentation === "row" && userId
      ? formatIconMetadata(<User className="size-3.5" />, `User ${userId}`)
      : userId
        ? formatMetadata(`user ${userId}`)
        : undefined,
    props.presentation === "row" && sessionId
      ? formatIconMetadata(
          <MessagesSquare className="size-3.5" />,
          `Session ${sessionId}`,
        )
      : sessionId
        ? formatMetadata(`session ${sessionId}`)
        : undefined,
  ]);

  return (
    <LoadedResourceReference
      href={props.href}
      metadata={metadata}
      presentation={props.presentation}
      title={title}
      type="trace"
    />
  );
}

export type InAppAgentResourceReferenceObservationProps =
  | LoadedResourceReferenceStateProps<unknown>
  | PendingResourceReferenceStateProps;

export function InAppAgentResourceReferenceObservation(
  props: InAppAgentResourceReferenceObservationProps,
) {
  if (props.state !== "loaded") {
    return renderPendingResourceReference({ ...props, type: "observation" });
  }

  const observationType = getStringField(props.resource, "type");
  const model =
    getStringField(props.resource, "model") ??
    getStringField(props.resource, "internalModel");
  const title =
    getStringField(props.resource, "name") ??
    getLabelText(props.label) ??
    "Observation reference";
  const metadata = compact([
    props.presentation === "row"
      ? undefined
      : optionalMetadata(observationType?.toLowerCase()),
    props.presentation === "row" && model
      ? formatIconMetadata(<Bot className="size-3.5" />, `Model ${model}`)
      : optionalMetadata(model),
    formatDateMetadata(getDateField(props.resource, "startTime")),
  ]);

  return (
    <LoadedResourceReference
      href={props.href}
      icon={getObservationIcon(observationType)}
      metadata={metadata}
      presentation={props.presentation}
      title={title}
      type="observation"
    />
  );
}

export type InAppAgentResourceReferenceScoreProps =
  | LoadedResourceReferenceStateProps<unknown>
  | PendingResourceReferenceStateProps;

export function InAppAgentResourceReferenceScore(
  props: InAppAgentResourceReferenceScoreProps,
) {
  if (props.state !== "loaded") {
    return renderPendingResourceReference({ ...props, type: "score" });
  }

  const dataType = getStringField(props.resource, "dataType");
  const title =
    getStringField(props.resource, "name") ??
    getLabelText(props.label) ??
    "Score reference";
  const metadata = compact([
    optionalMetadata(getScoreValue(props.resource)),
    props.presentation === "row"
      ? undefined
      : optionalMetadata(dataType?.toLowerCase()),
    optionalMetadata(getStringField(props.resource, "source")?.toLowerCase()),
    formatDateMetadata(getDateField(props.resource, "timestamp")),
  ]);

  return (
    <LoadedResourceReference
      href={props.href}
      icon={
        isScoreDataType(dataType) ? (
          getScoreTypeIcon(dataType)
        ) : (
          <CircleHelp className="size-3.5" />
        )
      }
      metadata={metadata}
      presentation={props.presentation}
      title={title}
      type="score"
    />
  );
}

function LoadedResourceReference({
  href,
  icon,
  metadata,
  presentation,
  title,
  type,
}: {
  href?: string;
  icon?: ReactNode;
  metadata: ResourceReferenceMetadata[];
  presentation: InAppAgentResourceReferencePresentation;
  title: string;
  type: ResourceReferenceType;
}) {
  const content =
    presentation === "inline" ? (
      <ResourcePill icon={icon} label={`${type}: ${title}`} />
    ) : (
      <ResourceRow icon={icon} metadata={metadata} title={title} type={type} />
    );

  if (!href) {
    return presentation === "row" ? (
      <ResourceRowFrame>{content}</ResourceRowFrame>
    ) : (
      content
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        presentation === "row" && resourceRowDividerClass,
        "!no-underline hover:!no-underline [&_*]:!no-underline",
      )}
      style={{ textDecoration: "none" }}
    >
      {content}
    </Link>
  );
}

function renderPendingResourceReference({
  label,
  presentation,
  state,
  type,
}: PendingResourceReferenceStateProps & { type: ResourceReferenceType }) {
  const isLoading = state === "loading";
  const rowTitle = isLoading
    ? `Loading ${type}`
    : `${capitalize(type)} unavailable`;
  const inlineLabel = isLoading
    ? `Loading ${type}`
    : (getLabelText(label) ?? rowTitle);

  if (presentation === "inline") {
    return (
      <ResourcePill
        icon={
          isLoading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <CircleHelp className="size-3" />
          )
        }
        label={inlineLabel}
        muted={!isLoading}
      />
    );
  }

  return (
    <ResourceRowFrame>
      <ResourceRow
        icon={
          isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CircleHelp className="size-3.5" />
          )
        }
        metadata={[]}
        muted={!isLoading}
        title={rowTitle}
        type={type}
      />
    </ResourceRowFrame>
  );
}

function ResourceRowFrame({ children }: { children: ReactNode }) {
  return <span className={resourceRowDividerClass}>{children}</span>;
}

function ResourcePill({
  icon,
  label,
  muted = false,
}: {
  icon?: ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "border-border bg-muted/60 text-foreground mx-0.5 inline-flex h-5 max-w-full translate-y-[0.125em] items-center gap-1 rounded-full border px-1.5 align-baseline text-[0.75em] leading-4 font-medium no-underline",
        muted && "text-muted-foreground",
      )}
    >
      {icon ? (
        <span className="text-muted-foreground flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

function ResourceRow({
  icon,
  metadata,
  muted = false,
  title,
  type,
}: {
  icon?: ReactNode;
  metadata: ResourceReferenceMetadata[];
  muted?: boolean;
  title: string;
  type: ResourceReferenceType;
}) {
  const metadataTitle = formatMetadataTitle(metadata);

  return (
    <span
      className={cn(
        "hover:bg-muted/40 grid min-w-0 items-center gap-2 px-2 py-1.5 text-left text-xs no-underline transition-colors",
        icon
          ? "grid-cols-[1rem_minmax(8rem,1fr)_minmax(7rem,0.9fr)]"
          : "grid-cols-[minmax(8rem,1fr)_minmax(7rem,0.9fr)]",
        muted && "text-muted-foreground hover:bg-transparent",
      )}
    >
      {icon ? (
        <span className="text-muted-foreground flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate font-medium">
        <span className="text-muted-foreground mr-1 capitalize">{type}</span>
        {title}
      </span>
      <span
        className="text-muted-foreground flex min-w-0 items-center gap-1 truncate"
        title={metadataTitle}
      >
        {metadata.length > 0 ? (
          <ResourceMetadataItems metadata={metadata} />
        ) : null}
      </span>
    </span>
  );
}

function ResourceMetadataItems({
  metadata,
}: {
  metadata: ResourceReferenceMetadata[];
}) {
  return metadata.map((item, index) => {
    const title = item.title ?? item.label;

    return (
      <span
        key={`${item.label}-${index}`}
        className="inline-flex min-w-0 items-center gap-1"
      >
        {index > 0 ? <span aria-hidden="true">·</span> : null}
        {item.icon ? (
          <span
            className="inline-flex shrink-0 items-center"
            title={title}
            aria-label={title}
          >
            {item.icon}
          </span>
        ) : (
          <span className="truncate">{item.label}</span>
        )}
      </span>
    );
  });
}

const resourceRowDividerClass = "border-border block border-b last:border-b-0";

const getObservationIcon = (type: string | undefined) => {
  return type ? renderFilterIcon(type) : <CircleHelp className="size-3.5" />;
};

const getScoreTypeIcon = (dataType: ScoreDataTypeType) => {
  switch (dataType) {
    case "NUMERIC":
      return <Hash className="size-3.5" />;
    case "CATEGORICAL":
      return <ListChecks className="size-3.5" />;
    case "BOOLEAN":
      return <ToggleLeft className="size-3.5" />;
    case "TEXT":
      return <TextIcon className="size-3.5" />;
    case "CORRECTION":
      return <CheckCircle2 className="size-3.5" />;
  }
};

const compact = <T,>(values: Array<T | undefined | null>) =>
  values.filter((value): value is T => Boolean(value));

const getStringField = (value: unknown, field: string) => {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" && fieldValue.trim()
    ? fieldValue
    : undefined;
};

const getDateField = (value: unknown, field: string) => {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  if (fieldValue instanceof Date) {
    return fieldValue;
  }

  if (typeof fieldValue === "string" || typeof fieldValue === "number") {
    const date = new Date(fieldValue);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
};

const getArrayField = (value: unknown, field: string) => {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return Array.isArray(fieldValue) ? fieldValue : undefined;
};

const getScoreValue = (score: unknown) => {
  if (!score || typeof score !== "object") {
    return undefined;
  }

  const scoreRecord = score as Record<string, unknown>;
  const stringValue = scoreRecord.stringValue;
  if (typeof stringValue === "string" && stringValue.trim()) {
    return stringValue;
  }

  const value = scoreRecord.value;
  return typeof value === "number" ? String(value) : undefined;
};

const isScoreDataType = (
  value: string | undefined,
): value is ScoreDataTypeType =>
  value === "NUMERIC" ||
  value === "CATEGORICAL" ||
  value === "BOOLEAN" ||
  value === "CORRECTION" ||
  value === "TEXT";

const getLabelText = (label: ReactNode) =>
  typeof label === "string" && label.trim() ? label.trim() : undefined;

const formatDateMetadata = (date: Date | undefined) => {
  if (!date) return undefined;

  return formatMetadata(formatDate(date), formatFullDate(date));
};

const formatDate = (date: Date) => {
  const now = new Date();
  const time = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  if (isSameCalendarDay(date, now)) {
    return time;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) {
    return `Yesterday, ${time}`;
  }

  const sixDaysAgo = new Date(now);
  sixDaysAgo.setDate(now.getDate() - 6);
  if (date >= startOfDay(sixDaysAgo) && date <= now) {
    const weekday = new Intl.DateTimeFormat("en", { weekday: "long" }).format(
      date,
    );
    return `${weekday}, ${time}`;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
};

const formatFullDate = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

const formatMetadata = (
  label: string,
  title?: string,
): ResourceReferenceMetadata => ({ label, title });

const formatIconMetadata = (
  icon: ReactNode,
  title: string | undefined,
): ResourceReferenceMetadata | undefined =>
  title ? { icon, label: title, title } : undefined;

const formatCountMetadata = (count: number | undefined, label: string) => {
  if (count === undefined) return undefined;

  return formatMetadata(`${count} ${label}${count === 1 ? "" : "s"}`);
};

const optionalMetadata = (label: string | undefined | null) =>
  label ? formatMetadata(label) : undefined;

const formatMetadataTitle = (metadata: ResourceReferenceMetadata[]) =>
  metadata.map((item) => item.title ?? item.label).join(" · ");

const isSameCalendarDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const startOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const capitalize = (value: string) =>
  value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;

type ResourceReferenceType = "trace" | "observation" | "score";
