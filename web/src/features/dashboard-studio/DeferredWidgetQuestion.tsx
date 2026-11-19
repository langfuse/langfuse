import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Badge } from "@/src/components/design-system/Badge/Badge";

export function DeferredWidgetQuestion({
  onTryLive,
  onCancel,
  dateRange,
}: {
  onTryLive: () => void;
  onCancel: () => void;
  dateRange: { from: Date; to: Date };
}) {
  const [question, setQuestion] = useState<
    "metadata-grouping" | "top-clients" | "score-join"
  >("metadata-grouping");
  const [key, setKey] = useState("workload");
  const [metric, setMetric] = useState("totalCost");
  const [limit, setLimit] = useState(10);
  const [score, setScore] = useState("");
  const [threshold, setThreshold] = useState(0.8);
  const [matching, setMatching] = useState("any");
  const [origin, setOrigin] = useState("all");
  const [scoreType, setScoreType] = useState("numeric");
  const [booleanValue, setBooleanValue] = useState("false");
  const [timeBasis, setTimeBasis] = useState("observations");
  const [window, setWindow] = useState("report");
  const originOptions = [
    { value: "all", label: "All origins" },
    { value: "API", label: "API" },
    { value: "EVAL", label: "Automated (EVAL)" },
    { value: "ANNOTATION", label: "Human annotation" },
  ];
  const windowLabels: Record<string, string> = {
    report: "Scores recorded in the report period",
    after: "Scores recorded within 24 hours after each observation",
    latest: "Latest score available, including after the report period",
  };
  const isScore = question === "score-join";
  const group =
    question === "top-clients" ? "metadata.clientId" : `metadata.${key || "…"}`;
  const titles = {
    "metadata-grouping": "How does cost vary across every workload?",
    "top-clients": "Which clients cost the most?",
    "score-join": "Which observations received a low score?",
  };
  const title = titles[question];
  const measures: Record<string, string> = {
    count: "Count",
    latency: "Average latency",
    totalCost: "Sum of total cost",
  };
  const measureLabel = isScore
    ? "Distinct observation count"
    : measures[metric];
  return (
    <section
      aria-label="Future query plan"
      className="ph-no-capture flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">Plan a deferred query</h2>
          <Badge color="warning" text="Backend work required" />
        </div>
        <Button text="Cancel" variant="ghost" onClick={onCancel} />
      </div>
      <div className="mx-auto grid w-full max-w-6xl gap-8 p-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="text-muted-foreground text-sm">
            Explore the question and its semantics. This plan is not executed or
            saved as a working chart.
          </p>
          <label className="flex flex-col gap-1.5 text-xs">
            Question
            <SelectInput
              aria-label="Deferred question"
              placeholder="Choose a question"
              value={question}
              options={[
                {
                  value: "metadata-grouping",
                  label: "Discover and group metadata values",
                },
                {
                  value: "top-clients",
                  label: "Rank top clients across all data",
                },
                {
                  value: "score-join",
                  label: "Filter observations by attached scores",
                },
              ]}
              onValueChange={setQuestion}
            />
          </label>
          {isScore ? (
            <>
              <label className="flex flex-col gap-1.5 text-xs">
                Score definition name
                <Input
                  aria-label="Planned score definition"
                  value={score}
                  placeholder="Choose the score to evaluate"
                  onChange={(e) => setScore(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs">
                  Score origin
                  <SelectInput
                    aria-label="Planned score origin"
                    placeholder="All origins"
                    value={origin}
                    options={originOptions}
                    onValueChange={setOrigin}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs">
                  Score type
                  <SelectInput
                    aria-label="Planned score type"
                    placeholder="Numeric"
                    value={scoreType}
                    options={[
                      { value: "numeric", label: "Numeric" },
                      { value: "boolean", label: "Boolean" },
                    ]}
                    onValueChange={setScoreType}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs">
                  Match
                  <SelectInput
                    aria-label="Score matching rule"
                    value={matching}
                    placeholder="Match"
                    options={[
                      { value: "any", label: "Any matching score" },
                      {
                        value: "latest",
                        label: "Latest score per observation",
                      },
                    ]}
                    onValueChange={setMatching}
                  />
                </label>
                {scoreType === "numeric" ? (
                  <label className="flex flex-col gap-1.5 text-xs">
                    Value below
                    <Input
                      aria-label="Planned score threshold"
                      type="number"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                  </label>
                ) : (
                  <label className="flex flex-col gap-1.5 text-xs">
                    Score equals
                    <SelectInput
                      aria-label="Planned boolean score value"
                      placeholder="False"
                      value={booleanValue}
                      options={[
                        { value: "false", label: "False / failed" },
                        { value: "true", label: "True / passed" },
                      ]}
                      onValueChange={setBooleanValue}
                    />
                  </label>
                )}
              </div>
              <label className="flex flex-col gap-1.5 text-xs">
                Time basis
                <SelectInput
                  aria-label="Planned time basis"
                  placeholder="Observations in report period"
                  value={timeBasis}
                  options={[
                    {
                      value: "observations",
                      label: "Observations started in the report period",
                    },
                    {
                      value: "scores",
                      label: "Scores recorded in the report period",
                    },
                  ]}
                  onValueChange={setTimeBasis}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs">
                Score matching window
                <SelectInput
                  aria-label="Planned score window"
                  placeholder="Report period"
                  value={window}
                  options={Object.entries(windowLabels).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  onValueChange={setWindow}
                />
              </label>
              <p className="text-muted-foreground text-xs">
                Count distinct observations after matching scores. Multiple
                matching score records must not multiply the observation count.
              </p>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-xs">
                Measure
                <SelectInput
                  aria-label="Planned measure"
                  value={metric}
                  placeholder="Measure"
                  options={[
                    { value: "totalCost", label: "Total cost" },
                    { value: "count", label: "Observation count" },
                    { value: "latency", label: "Average latency" },
                  ]}
                  onValueChange={setMetric}
                />
              </label>
              {question === "metadata-grouping" ? (
                <label className="flex flex-col gap-1.5 text-xs">
                  Metadata key
                  <Input
                    aria-label="Planned metadata key"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="workload"
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5 text-xs">
                Maximum groups
                <Input
                  aria-label="Planned group limit"
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </label>
              <p className="text-muted-foreground text-xs">
                Discover values across the selected population, then rank
                globally. This is different from comparing a few explicitly
                filtered queries.
              </p>
            </>
          )}
        </div>
        <div className="bg-muted/20 flex min-w-0 flex-col gap-4 rounded-xl border p-5">
          <h3 className="text-sm font-bold">Proposed query plan</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Source</dt>
            <dd>Observations{isScore ? " + scores" : ""}</dd>
            <dt className="text-muted-foreground">Report period</dt>
            <dd className="break-words">
              {dateRange.from.toISOString()} – {dateRange.to.toISOString()}
            </dd>
            <dt className="text-muted-foreground">Measure</dt>
            <dd>{measureLabel}</dd>
            <dt className="text-muted-foreground">
              {isScore ? "Relationship" : "Group by"}
            </dt>
            <dd className="break-all">
              {isScore ? "Score observationId → observation id" : group}
            </dd>
            {isScore ? (
              <>
                <dt className="text-muted-foreground">Score predicate</dt>
                <dd>
                  {score || "Definition not selected"}{" "}
                  {scoreType === "numeric"
                    ? `< ${threshold}`
                    : `= ${booleanValue}`}{" "}
                  · {scoreType} · {origin === "all" ? "all origins" : origin};{" "}
                  {matching === "latest"
                    ? "latest score only"
                    : "any score may match"}
                </dd>
                <dt className="text-muted-foreground">Time basis</dt>
                <dd>
                  {timeBasis === "observations"
                    ? "Observation start time"
                    : "Score timestamp"}{" "}
                  is inside the report period
                </dd>
                <dt className="text-muted-foreground">Score window</dt>
                <dd>{windowLabels[window]}</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Ranking</dt>
                <dd>
                  Top {limit} by the selected measure, across the full period
                </dd>
                <dt className="text-muted-foreground">Unseen values</dt>
                <dd>
                  Discovered by the query, rather than entered as separate
                  filters
                </dd>
              </>
            )}
          </dl>
          <div className="bg-background mt-auto rounded-lg border p-4">
            <h4 className="mb-2 text-xs font-bold">Execution boundary</h4>
            <p className="text-muted-foreground text-sm">
              {isScore
                ? "Requires a score-to-observation relationship with explicit matching, deduplication and time semantics. The first release intentionally excludes this join."
                : "Requires dynamic metadata grouping and global cardinality controls. Existing explicit metadata-value filters do not provide this operation."}
            </p>
          </div>
          <Button
            text="Run unavailable — backend capability required"
            disabled
          />
          <Button
            text="Try a live custom percentile"
            variant="outline"
            onClick={onTryLive}
          />
        </div>
      </div>
    </section>
  );
}
