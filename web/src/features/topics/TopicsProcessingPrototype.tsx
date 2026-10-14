import { useState } from "react";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { MoreHorizontal, Settings, Sparkles } from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { AutomaticProcessingControl } from "./AutomaticProcessingControl";
import { ManualTopicsDialog } from "./ManualTopicsDialog";
import { TopicTraceSelectionPrototype } from "./TopicTraceSelectionPrototype";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";

/** Previews manual processing and clustering with in-memory state. */
export function TopicsProcessingPrototype({
  configured: initiallyConfigured,
  automaticEnabled: initiallyAutomaticEnabled,
  configurePlacement,
  facets,
  traceCount,
  running,
  initialOperation,
  openInitially,
}: TopicsProcessingPrototypeProps) {
  const [automaticEnabled, setAutomaticEnabled] = useState(
    initiallyAutomaticEnabled,
  );
  const [configureOpenCount, setConfigureOpenCount] = useState(0);
  const [configured, setConfigured] = useState(initiallyConfigured);
  const [run, setRun] = useState<PreviewRun | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeFacets = facets.filter((facet) => facet.active);
  const configuredTitle = facets.some((facet) => facet.summaries > 0)
    ? "Your trace summaries are ready"
    : "Start with your traces";
  const emptyTitle = configured
    ? configuredTitle
    : "Set up Topics to get started";
  const handleToggleAutomatic = () => {
    setAutomaticEnabled((value) => !value);
  };
  const handleRefresh = () => {
    setNotice("Results refreshed.");
  };
  const handleViewRun = () => {
    setProgressOpen(true);
  };
  const handleHistory = () => {
    if (run) setProgressOpen(true);
    else setNotice("No previous manual runs in this preview.");
  };
  return (
    <>
      <DialogController<"configure" | "manual">
        key={configureOpenCount}
        initialState={() => {
          if (configureOpenCount > 0) return "configure";
          return openInitially ? "manual" : undefined;
        }}
        renderDialog={({ state, closeDialog }) => {
          const handleSaveConfiguration = () => {
            setConfigured(true);
            closeDialog();
          };
          const handleConfigure = () => {
            closeDialog();
            setConfigureOpenCount((value) => value + 1);
          };
          const handleSubmit = (submittedRun: PreviewRun) => {
            closeDialog();
            setRun(submittedRun);
            setProgressOpen(true);
          };
          return state === "configure" ? (
            <Dialog
              title="Configure Topics"
              actions={[
                {
                  label: "Save configuration",
                  onClick: handleSaveConfiguration,
                },
              ]}
            >
              <Dialog.Body>
                <div className="flex flex-col gap-4 text-sm">
                  <p>
                    Choose how traces are summarized, embedded, and grouped into
                    topics.
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
                    <dt className="text-muted-foreground">Summary model</dt>
                    <dd>GPT-4.1 mini</dd>
                    <dt className="text-muted-foreground">Embedding model</dt>
                    <dd>text-embedding-3-small</dd>
                    <dt className="text-muted-foreground">
                      Topic naming model
                    </dt>
                    <dd>GPT-4.1 mini</dd>
                    <dt className="text-muted-foreground">Facets</dt>
                    <dd>Intent, Outcome, Issues</dd>
                  </dl>
                </div>
              </Dialog.Body>
            </Dialog>
          ) : (
            <ManualProcessingDialogPrototype
              facets={activeFacets}
              traceCount={traceCount}
              running={running || run !== null}
              initialOperation={initialOperation}
              onConfigure={handleConfigure}
              onSubmit={handleSubmit}
            />
          );
        }}
      >
        {({ openDialog }) => {
          const handleOpenConfigure = () => openDialog("configure");
          const handleOpenManual = () => openDialog("manual");
          return (
            <div className="bg-background min-h-screen p-6">
              <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
                  <h1 className="text-xl font-bold">Topics</h1>
                  <div className="flex flex-wrap items-center gap-2">
                    {configured ? (
                      <AutomaticProcessingControl
                        state={{ status: automaticEnabled ? "on" : "off" }}
                        canWrite={true}
                        onOpen={handleToggleAutomatic}
                      />
                    ) : null}
                    {!configured || configurePlacement === "header" ? (
                      <Button
                        text="Configure Topics"
                        icon={Settings}
                        variant={configured ? "secondary" : "primary"}
                        size="sm"
                        onClick={handleOpenConfigure}
                      />
                    ) : null}
                    {configured ? (
                      <Button
                        text="Manual processing"
                        variant="secondary"
                        size="sm"
                        onClick={handleOpenManual}
                      />
                    ) : null}
                    <DropdownMenu
                      ariaLabel="Topics actions"
                      placement="bottom-end"
                      items={[
                        ...(configured && configurePlacement === "menu"
                          ? [
                              {
                                id: "configure",
                                type: "item" as const,
                                title: "Configure Topics",
                                icon: Settings,
                                onClick: handleOpenConfigure,
                              },
                            ]
                          : []),
                        {
                          id: "refresh",
                          type: "item",
                          title: "Refresh results",
                          onClick: handleRefresh,
                        },
                        {
                          id: "history",
                          type: "item",
                          title: "History",
                          onClick: handleHistory,
                        },
                      ]}
                    >
                      {({ getTriggerProps }) => (
                        <IconButton
                          {...getTriggerProps()}
                          icon={MoreHorizontal}
                          label="Topics actions"
                          size="sm"
                        />
                      )}
                    </DropdownMenu>
                  </div>
                </header>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    All environments · Last 7 days
                  </span>
                  <Badge
                    text={configured ? "Topics configured" : "Setup needed"}
                    color={configured ? "green" : "yellow"}
                  />
                </div>
                {run ? (
                  <Alert>
                    <Alert.Description>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>
                          {run.operation === "process"
                            ? "Trace processing"
                            : "Topic update"}{" "}
                          in progress
                        </span>
                        <Button
                          text="View run"
                          variant="secondary"
                          size="sm"
                          onClick={handleViewRun}
                        />
                      </div>
                    </Alert.Description>
                  </Alert>
                ) : null}
                {notice ? (
                  <Alert>
                    <Alert.Description>
                      <p role="status">{notice}</p>
                    </Alert.Description>
                  </Alert>
                ) : null}
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center text-sm">
                  <Sparkles className="icon-xl text-muted-foreground" />
                  <h2 className="font-bold">{emptyTitle}</h2>
                  <p className="text-muted-foreground max-w-md">
                    {!configured
                      ? "Connect your models and choose the facets you want to discover."
                      : "Process traces to create summaries and embeddings, then generate topics to discover groups. Automatic processing handles new traces when enabled."}
                  </p>
                  {configured ? (
                    <Button
                      text={
                        facets.some((f) => f.summaries > 0)
                          ? "Open manual processing"
                          : "Summarize traces & embed"
                      }
                      variant="secondary"
                      size="sm"
                      onClick={handleOpenManual}
                    />
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                  Storybook prototype · Actions preview the flow without
                  starting real runs.
                </p>
              </div>
            </div>
          );
        }}
      </DialogController>
      <Sheet open={progressOpen} onOpenChange={setProgressOpen}>
        <SheetContent className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Run status</SheetTitle>
            <SheetDescription>
              Inspect progress and results for this manual run.
            </SheetDescription>
          </SheetHeader>
          {run ? (
            <div className="flex flex-col gap-6 text-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold">
                  {run.operation === "process"
                    ? "Summarize traces & embed"
                    : "Generate topics"}
                </h2>
                <Badge text="Running" color="blue" />
              </div>
              <p className="text-muted-foreground">
                Last 7 days · {run.facets.map((facet) => facet.name).join(", ")}
              </p>
              <div className="flex flex-col gap-2">
                <span className="font-bold">
                  {run.operation === "process"
                    ? "Preparing summaries and embeddings"
                    : "Clustering stored summaries"}
                </span>
                <progress
                  aria-label="Run progress"
                  className="accent-primary h-2 w-full"
                  max={100}
                  value={42}
                />
                <span className="text-muted-foreground text-xs">
                  {run.operation === "process"
                    ? "Summaries and embeddings are created before traces are assigned to existing topics."
                    : "Groups are built before topics are named and traces are reassigned."}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="font-bold">Progress by facet</h3>
                {run.facets.map((facet) => (
                  <div
                    key={facet.name}
                    className="flex flex-col gap-3 rounded-md border p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold">{facet.name}</span>
                      <Badge
                        text={
                          facet.summaries < run.minimum
                            ? "More traces needed"
                            : "Running"
                        }
                        color={
                          facet.summaries < run.minimum ? "yellow" : "blue"
                        }
                      />
                    </div>
                    {facet.summaries < run.minimum ? (
                      <p className="text-muted-foreground">
                        Skipped: {facet.summaries} summaries available,{" "}
                        {run.minimum} required.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        {run.operation === "process"
                          ? `${Math.floor(facet.summaries * 0.42).toLocaleString()} of ${facet.summaries.toLocaleString()} traces processed`
                          : `${facet.summaries.toLocaleString()} stored summaries · Building topic groups`}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">0 errors</p>
                  </div>
                ))}
              </div>
              <Alert>
                <Alert.Description>
                  <p>
                    {run.operation === "process"
                      ? "When processing finishes, generate topics to discover or rebuild groups from the new summaries."
                      : "Your current topics stay visible until the new groups are ready."}
                  </p>
                </Alert.Description>
              </Alert>
              <p className="text-muted-foreground text-xs">
                Progress is mocked for this Storybook preview.
              </p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ManualProcessingDialogPrototype({
  facets,
  traceCount,
  running,
  initialOperation,
  onSubmit,
  onConfigure,
}: ManualProcessingDialogPrototypeProps) {
  const [operation, setOperation] = useState(initialOperation);
  const [selectedFacetIds, setSelectedFacetIds] = useState(
    facets.map((facet) => facet.name),
  );
  const [count, setCount] = useState(0);
  const [reuse, setReuse] = useState(true);
  const [smallSample, setSmallSample] = useState(false);
  const [generationTimeRange, setGenerationTimeRange] = useState<TimeRange>({
    range: "last7Days",
  });
  const minimum = smallSample ? 10 : 100;
  const selected = facets.filter((facet) =>
    selectedFacetIds.includes(facet.name),
  );
  const noSummaries = !selected.some((facet) => facet.summaries > 0);
  const handleToggleFacet = (id: string, checked: boolean) => {
    setSelectedFacetIds((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  };
  const handleSubmit = () => {
    onSubmit({
      operation,
      facets:
        operation === "process"
          ? selected.map((facet) => ({ ...facet, summaries: count }))
          : selected,
      minimum: operation === "update" ? minimum : 0,
    });
  };
  return (
    <ManualTopicsDialog
      operation={operation}
      onOperationChange={setOperation}
      facets={facets.map((facet) => ({ ...facet, id: facet.name }))}
      selectedFacetIds={selectedFacetIds}
      onToggleFacet={handleToggleFacet}
      traceControls={
        <TopicTraceSelectionPrototype
          matchedCount={traceCount}
          onSelect={setCount}
        />
      }
      count={count}
      generationTimeRange={generationTimeRange}
      onGenerationTimeRangeChange={setGenerationTimeRange}
      models={{
        summary: { model: "GPT-4.1 mini", connection: "OpenAI" },
        embedding: { model: "text-embedding-3-small", connection: "OpenAI" },
        clustering: { model: "GPT-4.1 mini", connection: "OpenAI" },
      }}
      reuse={reuse}
      onReuseChange={setReuse}
      smallSample={smallSample}
      onSmallSampleChange={setSmallSample}
      canSubmit={
        !running &&
        selected.length > 0 &&
        (operation === "process" ? count > 0 : !noSummaries)
      }
      isSubmitting={false}
      disabledReason={
        running ? "A Topics run is in progress. Wait for it to finish." : null
      }
      error={null}
      onConfigure={onConfigure}
      onSubmit={handleSubmit}
    />
  );
}

type Facet = {
  name: string;
  summaries: number;
  kind: "Built-in" | "Custom";
  active: boolean;
  version: number;
  description: string;
};
type Operation = "process" | "update";
type PreviewRun = { operation: Operation; facets: Facet[]; minimum: number };

type TopicsProcessingPrototypeProps = {
  configured: boolean;
  automaticEnabled: boolean;
  configurePlacement: "menu" | "header";
  facets: Facet[];
  traceCount: number;
  running: boolean;
  initialOperation: Operation;
  openInitially: boolean;
};

type ManualProcessingDialogPrototypeProps = {
  facets: Facet[];
  traceCount: number;
  running: boolean;
  initialOperation: Operation;
  onSubmit: (run: PreviewRun) => void;
  onConfigure: () => void;
};
