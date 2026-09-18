import type {
  AnalyticsData,
  AnnotationScoreFormData,
  ScoreTarget,
} from "@/src/features/scores/types";
import type { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export type AnnotationAnalyticsContext = AnalyticsData & {
  targetType: "trace" | "observation" | "session" | "dataset_item";
};

type FieldCounts = { fieldCount: number; filledFieldCount: number };
type ScoreProperties = AnnotationAnalyticsContext &
  FieldCounts & {
    dataType: AnnotationScoreFormData["dataType"];
    hasComment: boolean;
  };
type ControlProperties = {
  control: "segmented" | "select" | "slider" | "text" | "number";
  optionCount: number;
};
type QueueProperties = AnnotationAnalyticsContext & {
  objectType: "TRACE" | "OBSERVATION" | "SESSION";
  queueCount: number;
  itemCount?: number;
};

export type AnnotationEventMap = {
  "score:create_form_open": AnnotationAnalyticsContext & FieldCounts;
  "score:update_form_open": AnnotationAnalyticsContext & FieldCounts;
  "score:form_abandoned": AnnotationAnalyticsContext &
    FieldCounts & { durationMs: number };
  "score:create": ScoreProperties;
  "score:update": ScoreProperties;
  "score:delete": ScoreProperties;
  "score:update_comment": ScoreProperties;
  "score:delete_comment": ScoreProperties;
  "score:value_set": AnnotationAnalyticsContext &
    ControlProperties & {
      dataType: AnnotationScoreFormData["dataType"];
      isCorrection: boolean;
    };
  "annotation:entry_click": AnnotationAnalyticsContext & {
    entryPoint: "annotate_button" | "queue_button" | "tab";
  };
  "annotation_queues:item_added": QueueProperties;
  "annotation_queues:item_removed": QueueProperties;
  "annotation_queues:manage_click": QueueProperties;
};

export function getAnnotationTargetType(
  target: ScoreTarget,
): AnnotationAnalyticsContext["targetType"] {
  if (target.type === "session") return "session";
  return target.observationId ? "observation" : "trace";
}

function counts(
  fields: Pick<AnnotationScoreFormData, "dataType" | "value" | "stringValue">[],
): FieldCounts {
  return {
    fieldCount: fields.length,
    filledFieldCount: fields.filter((field) =>
      field.dataType === "TEXT"
        ? Boolean(field.stringValue)
        : field.value !== null && field.value !== undefined,
    ).length,
  };
}

type Capture = ReturnType<typeof usePostHogClientCapture>;
type SaveKind =
  | "create"
  | "update"
  | "delete"
  | "update_comment"
  | "delete_comment";

export function createAnnotationAnalytics(
  capture: Capture,
  context: AnnotationAnalyticsContext,
  initialFields: AnnotationScoreFormData[],
) {
  const metadata = {
    type: context.type,
    source: context.source,
    targetType: context.targetType,
    isV4: context.isV4,
  };
  const values = new Map(
    initialFields.map((field) => [field.configId, { ...field }]),
  );
  const confirmed = new Map(values);
  const pendingValues = new Map<
    string,
    { field: AnnotationScoreFormData; sequence: number }[]
  >();
  const confirmedSequence = new Map<string, number>();
  let sequence = 0;
  let fieldCounts = counts(initialFields);
  let openedAt: number | undefined;
  let closedAt: number | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let pending = 0;
  let saved = false;
  let abandoned = false;

  const abandon = () => {
    if (!closed || pending || saved || abandoned || openedAt === undefined)
      return;
    abandoned = true;
    capture("score:form_abandoned", {
      ...metadata,
      ...fieldCounts,
      durationMs: Math.max(0, (closedAt ?? Date.now()) - openedAt),
    });
  };

  return {
    open() {
      clearTimeout(closeTimer);
      closed = false;
      closedAt = undefined;
      if (openedAt !== undefined) return;
      openedAt = Date.now();
      capture(
        initialFields.some((field) => field.id)
          ? "score:update_form_open"
          : "score:create_form_open",
        { ...metadata, ...fieldCounts },
      );
    },
    close(
      fields?: Pick<
        AnnotationScoreFormData,
        "dataType" | "value" | "stringValue"
      >[],
    ) {
      if (fields) fieldCounts = counts(fields);
      closedAt = Date.now();
      // React effect replay must not look like a reviewer closing the form.
      closeTimer = setTimeout(() => {
        closed = true;
        abandon();
      }, 0);
    },
    beginSave(
      kind: SaveKind,
      field: AnnotationScoreFormData,
      fields: AnnotationScoreFormData[],
      control?: ControlProperties,
    ) {
      const previous = values.get(field.configId);
      const isValueSave = kind === "create" || kind === "update";
      const changed = (baseline: AnnotationScoreFormData | undefined) => {
        if (kind === "delete") return Boolean(baseline?.id);
        if (!isValueSave)
          return (baseline?.comment ?? null) !== (field.comment ?? null);
        if (!baseline) return true;
        return field.dataType === "TEXT"
          ? baseline.stringValue !== field.stringValue
          : baseline.value !== field.value ||
              baseline.stringValue !== field.stringValue;
      };
      const valueChanged = changed(previous);
      if (!valueChanged && !pendingValues.get(field.configId)?.length) return;

      const next = { ...field };
      const operation = { field: next, sequence: ++sequence };
      pendingValues.set(field.configId, [
        ...(pendingValues.get(field.configId) ?? []),
        operation,
      ]);
      values.set(field.configId, next);
      fieldCounts = counts(fields);
      const properties: ScoreProperties = {
        ...metadata,
        ...fieldCounts,
        dataType: field.dataType,
        hasComment: Boolean(field.comment),
      };
      if (isValueSave && valueChanged && control) {
        capture("score:value_set", {
          ...metadata,
          ...control,
          dataType: field.dataType,
          isCorrection: Boolean(previous?.id),
        });
      }
      pending++;
      let settled = false;
      const settle = (success: boolean) => {
        pending--;
        if (
          success &&
          operation.sequence > (confirmedSequence.get(field.configId) ?? 0)
        ) {
          confirmed.set(field.configId, next);
          confirmedSequence.set(field.configId, operation.sequence);
        }
        const remaining = (pendingValues.get(field.configId) ?? []).filter(
          (item) => item !== operation,
        );
        pendingValues.set(field.configId, remaining);
        const latest = remaining.at(-1);
        const current =
          latest &&
          latest.sequence > (confirmedSequence.get(field.configId) ?? 0)
            ? latest.field
            : confirmed.get(field.configId);
        if (current) values.set(field.configId, current);
        else values.delete(field.configId);
      };
      return {
        success() {
          if (settled) return;
          settled = true;
          const savedChange = changed(confirmed.get(field.configId));
          settle(true);
          if (savedChange) {
            saved = true;
            capture(`score:${kind}`, properties);
          }
        },
        failure() {
          if (settled) return;
          settled = true;
          settle(false);
          abandon();
        },
      };
    },
  };
}
