import { useState } from "react";
import { ObservabilityEntityDetailHeader } from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { Input } from "@/src/components/ui/input";
import { IOSection } from "@/src/components/ui/IOSection";
import { SpanContentView } from "@/src/features/traces/components/SpanContent";
import { TraceDetailTabsBarList } from "@/src/features/traces/components/TraceDetailTabsBarList";
import { VirtualizedTreeNodeWrapper } from "@/src/features/traces/components/VirtualizedTreeNodeWrapper";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TraceWorkspacePanels } from "@/src/features/traces/components/TraceWorkspacePanels";
import { ViewPreferencesProvider } from "@/src/features/traces/contexts/ViewPreferencesProvider";
import { SelectionProvider } from "@/src/features/traces/contexts/SelectionProvider";
import { NotebookEmbed } from "../NotebookEmbed/NotebookEmbed";
import { NotebookEmbedNavigation } from "../NotebookEmbed/NotebookEmbedNavigation";
import { NotebookEmbedWorkspace } from "../NotebookEmbed/NotebookEmbedWorkspace";

const observations = [
  {
    name: "Checkout request",
    type: "SPAN",
    depth: 0,
    offsetMs: 0,
    durationMs: 1290,
    input: "Customer: Please place the order in my cart.",
    output:
      "Checkout ended before an order was created. A customer reply was sent.",
  },
  {
    name: "Load cart",
    type: "TOOL",
    depth: 1,
    offsetMs: 14,
    durationMs: 78,
    input: "cart_id: cart_4821",
    output: "2 items · USD 58.40 · inventory available",
  },
  {
    name: "Create order",
    type: "CHAIN",
    depth: 1,
    offsetMs: 109,
    durationMs: 842,
    input: "cart_id: cart_4821 · total: USD 58.40",
    output: "PAYMENT_DECLINED — no order was created.",
    error: "Order creation stopped before confirmation.",
  },
  {
    name: "Authorize payment",
    type: "TOOL",
    depth: 2,
    offsetMs: 127,
    durationMs: 806,
    input:
      "amount: 5840 minor units · currency: USD · payment method: Visa ending in 4242",
    output: "Authorization declined. No charge was captured.",
    error: "Processor response: insufficient_funds",
  },
  {
    name: "Generate customer reply",
    type: "GENERATION",
    depth: 1,
    offsetMs: 975,
    durationMs: 297,
    input:
      "Report the checkout outcome and give the customer a next step. Tool result: PAYMENT_DECLINED.",
    output: "Your order is confirmed! You’ll receive a shipping email shortly.",
  },
] as const;

const startedAt = new Date("2026-01-15T12:00:00Z");

export function ResourceEmbedFixture({
  kind,
  resourceId,
  variableName,
}: {
  kind: "trace" | "session";
  resourceId: string | undefined;
  variableName: string | undefined;
}) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState(0);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  if (kind !== "trace" || resourceId !== "trace-checkout") {
    return (
      <NotebookEmbed
        projectId="storybook"
        kind={kind}
        state={
          resourceId
            ? { status: "unavailable" }
            : { status: "empty", variableName }
        }
      />
    );
  }
  const selected = observations[selection];

  return (
    <NotebookEmbedWorkspace kind={kind}>
      <NotebookEmbedNavigation>
        <ViewPreferencesProvider traceContext="peek">
          <SelectionProvider
            defaultObservationId={null}
            isMobile={false}
            expandDetailOnMount={false}
          >
            <div className="flex h-full flex-col">
              <ObservabilityEntityDetailHeader
                variant="page"
                metrics={[]}
                headerProps={{
                  title: observations[0].name,
                  itemType: "TRACE",
                  actions: [],
                }}
              />
              <TraceWorkspacePanels
                groupId={`notebook-story-${kind}`}
                defaultNavigationCollapsed={false}
                reviewOpen={false}
                reviewPanel={null}
                navigation={
                  <div className="h-full overflow-auto">
                    <div className="border-b p-2">
                      <Input
                        aria-label="Search observations"
                        placeholder="Search observations"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    {observations.map((observation, index) => {
                      if (
                        !observation.name
                          .toLowerCase()
                          .includes(search.toLowerCase())
                      )
                        return null;
                      const { type, depth, offsetMs } = observation;
                      if (
                        !search &&
                        ((depth > 0 && collapsed.has(0)) ||
                          (depth === 2 && collapsed.has(2)))
                      )
                        return null;
                      const level =
                        "error" in observation ? "ERROR" : "DEFAULT";
                      const hasChildren =
                        !search &&
                        (observations[index + 1]?.depth ?? 0) > depth;
                      const select = () => setSelection(index);
                      return (
                        <VirtualizedTreeNodeWrapper
                          key={observation.name}
                          nodeType={type}
                          metadata={{
                            depth: search ? 0 : depth,
                            isLastSibling:
                              Boolean(search) || index >= 3 || index === 0,
                            treeLines: !search && depth === 2 ? [true] : [],
                          }}
                          hasChildren={hasChildren}
                          isCollapsed={collapsed.has(index)}
                          onToggleCollapse={() =>
                            setCollapsed((previous) => {
                              const next = new Set(previous);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                          isSelected={selection === index}
                          onSelect={select}
                        >
                          <SpanContentView
                            node={{
                              id: observation.name,
                              name: observation.name,
                              type,
                              level,
                              startTime: new Date(
                                startedAt.getTime() + offsetMs,
                              ),
                              latency: observation.durationMs / 1000,
                              startTimeSinceTrace: offsetMs / 1000,
                              startTimeSinceParentStart:
                                depth === 0
                                  ? null
                                  : (offsetMs -
                                      (depth === 2
                                        ? observations[2].offsetMs
                                        : 0)) /
                                    1000,
                              depth,
                              childrenDepth: hasChildren ? 1 : 0,
                              children: [],
                            }}
                            onSelect={select}
                            mergedScores={[]}
                            corrections={[]}
                          />
                        </VirtualizedTreeNodeWrapper>
                      );
                    })}
                  </div>
                }
                detail={
                  <div className="bg-surface-sunken flex h-full flex-col overflow-hidden">
                    <ObservabilityEntityDetailHeader
                      variant="page"
                      metrics={[
                        {
                          id: "duration",
                          type: "value",
                          text: `${selected.durationMs} ms`,
                          searchText: "Duration",
                        },
                      ]}
                      headerProps={{
                        title: selected.name,
                        itemType: selected.type,
                        titleLevel: "error" in selected ? "ERROR" : "DEFAULT",
                        actions: [],
                      }}
                    />
                    <Tabs defaultValue="preview" layout="fill">
                      <TraceDetailTabsBarList
                        tabs={["preview"]}
                        logViewDescription=""
                        trailingControls={null}
                      />
                      <Tabs.Content value="preview" layout="fill">
                        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
                          {"error" in selected && (
                            <IOSection title="Error" tone="danger">
                              {selected.error}
                            </IOSection>
                          )}
                          <IOSection title="Input">{selected.input}</IOSection>
                          <IOSection title="Output">
                            {selected.output}
                          </IOSection>
                        </div>
                      </Tabs.Content>
                    </Tabs>
                  </div>
                }
              />
            </div>
          </SelectionProvider>
        </ViewPreferencesProvider>
      </NotebookEmbedNavigation>
    </NotebookEmbedWorkspace>
  );
}
