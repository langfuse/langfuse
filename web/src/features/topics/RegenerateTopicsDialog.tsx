import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input as NumericInput } from "@/src/components/ui/input";
import {
  topicMinimumTraceCountSchema,
  type TopicExecutionStatus,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  type RegenerateFacet,
  type RegenerateLastRun,
  type RegenerateRequest,
} from "./useRegenerateTopics";

const label = "Regenerate topics";
const runStatus: Record<
  TopicExecutionStatus,
  { text: string; color: "blue" | "green" | "yellow" | "red" }
> = {
  queued: { text: "Queued", color: "blue" },
  running: { text: "Running", color: "blue" },
  completed: { text: "Completed", color: "green" },
  completed_with_errors: { text: "Finished with errors", color: "yellow" },
  failed: { text: "Failed", color: "red" },
};

export function RegenerateTopicsDialog({
  facets,
  timeRange,
  lastRun,
  disabledReason,
  isSubmitting,
  error,
  onSubmit,
  onOpenRun,
}: {
  facets: RegenerateFacet[];
  timeRange: TopicTimeRange;
  lastRun: RegenerateLastRun | null;
  disabledReason: string | null;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (request: RegenerateRequest) => void;
  onOpenRun: (executionId: string) => void;
}) {
  const [selectedFacetIds, setSelectedFacetIds] = useState(
    () =>
      new Set(
        facets
          .filter((facet) => facet.summaries > 0)
          .map((facet) => facet.facet.id),
      ),
  );
  const [exploratory, setExploratory] = useState(false);
  const [minimumTraceCount, setMinimumTraceCount] = useState<string | null>(
    null,
  );
  const minimumValue = minimumTraceCount ?? (exploratory ? "10" : "100");
  const minimum = topicMinimumTraceCountSchema.safeParse(Number(minimumValue));
  const selected = facets.filter(
    (facet) => facet.summaries > 0 && selectedFacetIds.has(facet.facet.id),
  );
  const belowMinimum = minimum.success
    ? selected.filter((facet) => facet.summaries < minimum.data)
    : [];

  return (
    <Dialog
      title={label}
      size="lg"
      actions={[
        {
          label,
          loading: isSubmitting,
          disabled:
            disabledReason !== null ||
            isSubmitting ||
            !minimum.success ||
            selected.length === 0,
          onClick: () => {
            if (!minimum.success) return;
            onSubmit({
              facets: selected.map(({ facet, version }) => ({
                facetId: facet.id,
                version: version.version,
              })),
              exploratory,
              minimumTraceCount: minimum.data,
            });
          },
        },
      ]}
    >
      <Dialog.Body>
        <div className="ph-no-capture flex flex-col gap-5 text-sm">
          <div className="flex flex-col gap-2">
            <p>
              Rebuilds topics for each selected facet from the trace summaries
              already stored in this time range. Summaries are grouped, each
              group is named, and traces are reassigned to the new topics.
            </p>
            <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5">
              <li>
                No traces are summarized again. Stored summaries and embeddings
                are reused.
              </li>
              <li>
                Your clustering model names each topic, billed to its LLM
                connection.
              </li>
              <li>
                The new topics replace the ones shown on this page. Topic names
                and groups can change. If the run fails, the current topics
                stay.
              </li>
            </ul>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Time range</dt>
            <dd>
              {format(timeRange.from, "MMM d, yyyy HH:mm")} –{" "}
              {format(timeRange.to, "MMM d, yyyy HH:mm")}
              <span className="text-muted-foreground">
                {" "}
                · from the page time picker
              </span>
            </dd>
            <dt className="text-muted-foreground">Last run</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {lastRun ? (
                <>
                  <Badge
                    text={runStatus[lastRun.status].text}
                    color={runStatus[lastRun.status].color}
                  />
                  <span>
                    {formatDistanceToNow(new Date(lastRun.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <Button
                    text="View run"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenRun(lastRun.id)}
                  />
                </>
              ) : (
                <span className="text-muted-foreground">
                  Topics have not been regenerated yet.
                </span>
              )}
            </dd>
          </dl>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-bold">Facets</legend>
            {facets.map(({ facet, summaries }) => (
              <label
                key={facet.id}
                className="bg-muted/30 flex items-center justify-between gap-3 rounded-md p-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    aria-label={facet.name}
                    disabled={summaries === 0}
                    checked={summaries > 0 && selectedFacetIds.has(facet.id)}
                    onCheckedChange={(checked) =>
                      setSelectedFacetIds((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(facet.id);
                        else next.delete(facet.id);
                        return next;
                      })
                    }
                  />
                  {facet.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {summaries > 0
                    ? `${summaries.toLocaleString()} summaries`
                    : "No summaries in this range"}
                </span>
              </label>
            ))}
          </fieldset>
          {belowMinimum.length > 0 && (
            <Alert variant="warning" size="sm">
              <Alert.Description>
                <p>
                  {belowMinimum.map(({ facet }) => facet.name).join(", ")}{" "}
                  {belowMinimum.length === 1 ? "has" : "have"} fewer than{" "}
                  {minimum.success ? minimum.data.toLocaleString() : ""}{" "}
                  summaries and will be marked &ldquo;More traces needed&rdquo;.
                  Summarize more traces, widen the time range, or use small
                  sample mode under Advanced.
                </p>
              </Alert.Description>
            </Alert>
          )}
          <Accordion type="single" collapsible>
            <Accordion.Item value="advanced">
              <Accordion.Trigger size="sm">Advanced</Accordion.Trigger>
              <Accordion.Content>
                <div className="flex flex-col gap-3 pb-3">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={exploratory}
                      onCheckedChange={(value) =>
                        setExploratory(value === true)
                      }
                    />
                    Small sample mode (smaller, provisional topics)
                  </label>
                  <label className="flex flex-col gap-1">
                    Minimum summaries per facet
                    <NumericInput
                      aria-label="Minimum summaries per facet"
                      aria-invalid={!minimum.success}
                      className="w-28"
                      type="number"
                      min={3}
                      step={1}
                      value={minimumValue}
                      onChange={(event) =>
                        setMinimumTraceCount(event.target.value)
                      }
                    />
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {minimum.success
                      ? `Facets with fewer than ${minimum.data.toLocaleString()} summaries are skipped.`
                      : "Enter a whole number of at least 3."}{" "}
                    Small sample mode lowers the default minimum to 10 and the
                    minimum topic size from 15 to 3 traces.
                  </p>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
          {disabledReason && (
            <Alert variant="warning" size="sm">
              <Alert.Description>
                <p className="break-words">{disabledReason}</p>
              </Alert.Description>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" size="sm">
              <Alert.Description>
                <p className="break-words">{error}</p>
              </Alert.Description>
            </Alert>
          )}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
