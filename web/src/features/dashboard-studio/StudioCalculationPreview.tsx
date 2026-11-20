import { useState } from "react";
import { type StudioResult, type StudioWidgetConfig } from "@langfuse/shared";
import { StudioInlineSelect } from "./StudioInlineSelect";
import { toFullMetricString } from "@/src/features/widgets/chart-library/utils";
import { useDashboardStudioCapture } from "./analytics";
import { prepareStudioCalculation } from "./prepareStudioCalculation";
import { studioMetricFormatter } from "./prepareStudioChart";

type CalculationTerm = NonNullable<
  ReturnType<typeof prepareStudioCalculation>
>["terms"][number];

function CalculationValue({ term }: { term: CalculationTerm }) {
  if (term.value === undefined)
    return <span className="text-muted-foreground text-sm">Not returned</span>;
  if (term.value === null)
    return (
      <span className="text-muted-foreground text-sm">No measured value</span>
    );
  const value = toFullMetricString(
    studioMetricFormatter(term.unit)(term.value, { style: "full" }),
  );
  const separateUnit =
    term.unit && !["milliseconds", "USD", "%", "percent"].includes(term.unit);
  return (
    <span title={String(term.value)}>
      {value}
      {separateUnit ? (
        <span className="text-muted-foreground text-xs font-normal">
          {" "}
          {term.unit}
        </span>
      ) : null}
    </span>
  );
}

/** Explains one returned formula point without executing or recreating its arithmetic. */
export function StudioCalculationPreview({
  config,
  result,
  isV4,
  expressionId,
  onSelectExpression,
}: {
  config: StudioWidgetConfig;
  result: StudioResult;
  isV4: boolean;
  expressionId: string | undefined;
  onSelectExpression: (id: string) => void;
}) {
  const [pointKey, setPointKey] = useState<string>();
  const track = useDashboardStudioCapture(isV4);
  const calculation = prepareStudioCalculation(
    config,
    result,
    expressionId,
    pointKey,
  );
  if (!calculation)
    throw new Error("Calculation preview requires a configured formula");
  const trackSelection = (
    target: "calculation_formula" | "calculation_point",
  ) => {
    track("view_changed", {
      target,
      controlId: "formula",
      scope: "display",
      widgetKind: "query",
      selectedCount: 1,
    });
  };
  return (
    <section
      className="ph-no-capture bg-muted/40 @container/calculation min-w-0 rounded-md px-4 pt-2.5 pb-4"
      aria-label="Calculation preview"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">Calculation</h3>
          <p className="text-muted-foreground font-mono text-xs break-all">
            {calculation.formula}
          </p>
        </div>
        {calculation.expressionOptions.length > 1 ? (
          <div className="w-full min-w-0 sm:w-52">
            <StudioInlineSelect
              label="Calculation formula"
              placeholder="Formula"
              value={calculation.expression.id}
              options={calculation.expressionOptions}
              onValueChange={(value) => {
                if (value === calculation.expression.id) return;
                onSelectExpression(value);
                trackSelection("calculation_formula");
              }}
            />
          </div>
        ) : null}
        {calculation.points.length > 1 ? (
          <label className="flex max-w-full min-w-0 items-center gap-2 text-xs">
            <span className="text-muted-foreground shrink-0">
              {calculation.point?.time ? "Time bucket" : "Group"}
            </span>
            <div className="max-w-56 min-w-0">
              <StudioInlineSelect
                label="Calculation point"
                placeholder="Choose a returned point"
                value={calculation.point!.value}
                options={calculation.points}
                onValueChange={(value) => {
                  if (value === calculation.point?.value) return;
                  setPointKey(value);
                  trackSelection("calculation_point");
                }}
              />
            </div>
          </label>
        ) : (
          <p className="text-muted-foreground text-xs break-words">
            {calculation.point?.label ?? "No calculation point was returned."}
          </p>
        )}
      </div>
      <dl
        aria-label="Calculation values"
        className="grid gap-x-5 gap-y-2 @min-[440px]/calculation:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]"
      >
        {calculation.terms.map((term) => (
          <div
            key={term.reference}
            className="flex min-w-0 items-baseline justify-between gap-2 @min-[440px]/calculation:flex-col @min-[440px]/calculation:gap-1"
          >
            <dt
              className="text-muted-foreground flex min-w-0 items-baseline gap-1.5 text-xs"
              title={
                term.hidden ? `${term.label} · Hidden in chart` : term.label
              }
            >
              <span className="shrink-0 font-mono">{term.token}</span>
              <span className="break-words">{term.label}</span>
            </dt>
            <dd
              className={
                term.computed
                  ? "text-base font-bold tabular-nums @min-[440px]/calculation:text-xl"
                  : "text-base tabular-nums @min-[440px]/calculation:text-xl"
              }
            >
              <CalculationValue term={term} />
            </dd>
          </div>
        ))}
      </dl>
      {calculation.terms.some((term) => term.value === undefined) ? (
        <p className="text-muted-foreground pt-3 text-xs">
          A missing input leaves the calculation empty for this point.
        </p>
      ) : null}
    </section>
  );
}
