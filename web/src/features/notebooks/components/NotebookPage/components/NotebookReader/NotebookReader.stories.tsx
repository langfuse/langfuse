import { type ComponentProps } from "react";
import { buildNotebookPath } from "@langfuse/shared";
import { useArgs } from "storybook/preview-api";
import { expect, fn, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { readingColumnClassName } from "@/src/components/layouts/reading-column";
import { notebookLayoutSchema } from "@/src/features/notebooks/schema";
import { cn } from "@/src/utils/tailwind";
import { NotebookChart } from "../NotebookChart/NotebookChart";
import { ResourceEmbedFixture } from "./ResourceEmbedFixture";
import { NotebookVersionHistory } from "../NotebookVersionHistory/NotebookVersionHistory";
import { issueTracker } from "@/.storybook/fixtures/notebooks/issueTracker";
import { monitorInvestigation } from "@/.storybook/fixtures/notebooks/monitorInvestigation";
import { promptExperiments } from "@/.storybook/fixtures/notebooks/promptExperiments";
import {
  bullets,
  paragraph,
  strong,
  text,
  type NotebookFixture,
} from "@/.storybook/fixtures/notebooks/supportAssistantFixtures";
import { supportDashboard } from "@/.storybook/fixtures/notebooks/supportDashboard";
import { NotebookReader } from "./NotebookReader";

type NotebookStoryArgs = ComponentProps<typeof NotebookReader> &
  ComponentProps<typeof NotebookVersionHistory> & {
    fixture: NotebookFixture;
  };

function fixtureView(
  fixture: NotebookFixture,
  version: number | null,
  documentId: string | null,
): NotebookStoryArgs["view"] {
  const snapshot =
    version === null
      ? fixture.draft
      : fixture.publications.find(({ number }) => number === version)
          ?.documents;
  if (!snapshot) throw new Error(`Missing version ${version} of ${fixture.id}`);
  const document = snapshot.find(({ id }) => id === documentId) ?? snapshot[0];
  const documents = snapshot.map(({ id }) => ({
    id,
    url: buildNotebookPath({
      projectId: "storybook",
      notebookId: fixture.id,
      documentId: id,
      version,
    }),
  }));

  return {
    documentId: document.id,
    layout: notebookLayoutSchema.parse(
      fixture.layout === "default"
        ? {
            kind: "default",
            width: fixture.width,
            variables: fixture.variables,
            bindings: fixture.bindings,
            propertySchema: fixture.propertySchema,
            document: {
              title: document.title,
              properties: document.properties,
            },
          }
        : {
            kind: fixture.layout,
            ...(fixture.layout === "tabs" ? { width: fixture.width } : {}),
            propertySchema: fixture.propertySchema,
            documents: snapshot.map(({ id, title, properties }) => ({
              documentId: id,
              title,
              properties,
            })),
          },
    ),
    documents,
    blocks: document.blocks,
    version,
    versions: fixture.publications.map(({ number, publishedAt }) => ({
      number,
      publishedAt,
    })),
    isDraft: version === null,
    notebookDirty: fixture.draft !== undefined,
  };
}

function startingArgs(
  fixture: NotebookFixture,
  version: number | null,
): Pick<NotebookStoryArgs, "fixture" | "view" | "renderChart"> {
  return {
    fixture,
    view: fixtureView(fixture, version, null),
    renderChart: (block, values, filters) => (
      <NotebookChart
        block={block}
        filters={filters}
        state={{
          type: "ready",
          rows: (
            (typeof values?.filter === "string"
              ? fixture.chartRowsBySelection?.[values.filter]?.[block.id]
              : fixture.chartRows[block.id]) ?? []
          ).filter((row) => {
            const range = values?.timeRange;
            if (typeof range !== "object") return true;
            if (typeof row.time_dimension !== "string") return true;
            const time = Date.parse(row.time_dimension);
            return (
              time >= Date.parse(range.start) && time < Date.parse(range.end)
            );
          }),
        }}
      />
    ),
  };
}

const meta = preview.meta({
  component: NotebookReader,
  parameters: { layout: "fullscreen" },
  args: {
    ...startingArgs(monitorInvestigation, 2),
    isLoadingDocument: false,
    onDocumentChange: fn(),
    onVersionChange: fn(),
  },
  render: function NotebookLayoutExample(args: NotebookStoryArgs) {
    const [, updateArgs] = useArgs<NotebookStoryArgs>();
    return (
      <div className="flex h-dvh flex-col">
        <header
          className={cn(
            "shrink-0",
            args.view.layout.kind !== "tabs" && "border-b",
          )}
        >
          <div
            className={cn(
              "flex min-h-11 items-center gap-2 px-4 py-1",
              args.view.layout.kind !== "inbox" &&
                args.view.layout.width !== "full" &&
                readingColumnClassName,
            )}
          >
            <h1 className="min-w-0 truncate text-base font-bold">
              {args.fixture.title}
            </h1>
            {args.view.isDraft && <Badge text="Draft" size="sm" />}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {args.view.layout.bindings?.some(
                ({ kind }) => kind === "write",
              ) && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={args.showControlledVariables ?? false}
                    onCheckedChange={(checked) =>
                      updateArgs({ showControlledVariables: checked === true })
                    }
                  />
                  Show element-controlled variables
                </label>
              )}
              <NotebookVersionHistory
                view={args.view}
                onVersionChange={(version) => {
                  updateArgs({
                    view: fixtureView(args.fixture, version, null),
                  });
                  args.onVersionChange(version);
                }}
              />
            </div>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <NotebookReader
            key={`${args.fixture.id}:${args.view.version ?? "draft"}`}
            view={args.view}
            showControlledVariables={args.showControlledVariables}
            isLoadingDocument={args.isLoadingDocument}
            renderChart={args.renderChart}
            renderEmbed={args.renderEmbed}
            onDocumentChange={(documentId, version) => {
              updateArgs({
                view: fixtureView(args.fixture, version, documentId),
              });
              args.onDocumentChange(documentId, version);
            }}
          />
        </main>
      </div>
    );
  },
});

export const IssueTracker = meta.story({
  args: startingArgs(issueTracker, null),
});
export const MonitorInvestigation = meta.story({});
export const ResourceEmbeds = meta.story({
  name: "Checkout Quality Review",
  args: {
    ...startingArgs(
      {
        id: "resource-embeds",
        title: "Checkout Quality Review",
        layout: "default",
        width: "full",
        publications: [
          {
            number: 1,
            publishedAt: new Date("2026-01-15T12:00:00Z"),
            documents: [
              {
                id: "main",
                title: "Checkout Quality Review",
                blocks: [
                  text(
                    "review-intro",
                    paragraph(
                      "A customer asked the assistant to place the order in their cart. Check what happened in the trace, then rate the reply they received.",
                    ),
                    paragraph(strong("What to check")),
                    bullets(
                      paragraph(
                        "Open ",
                        strong("Authorize payment"),
                        " and ",
                        strong("Create order"),
                        " to verify the payment and order status.",
                      ),
                      paragraph(
                        "Open ",
                        strong("Generate customer reply"),
                        " and check whether the reply matches those results.",
                      ),
                    ),
                  ),
                  {
                    id: "checkout-review-row",
                    schema: "row@1",
                    props: {
                      widths: [5, 2],
                      children: [
                        {
                          id: "trace-preview",
                          schema: "embed@1",
                          props: {
                            target: { kind: "trace", id: "trace-checkout" },
                          },
                        },
                        {
                          id: "checkout-review-guide",
                          schema: "row@1",
                          props: {
                            children: [
                              text(
                                "review-guide",
                                paragraph(
                                  strong("Good"),
                                  " — Reports the outcome accurately and gives a useful next step if checkout failed.",
                                ),
                                paragraph(
                                  strong("Bad"),
                                  " — Misstates the outcome, makes an unsupported promise, or gives no useful next step after a failure.",
                                ),
                              ),
                              ...[
                                { label: "Good", value: 1 },
                                { label: "Bad", value: 0 },
                              ].map(({ label, value }) => ({
                                id: `rate-${label.toLowerCase()}`,
                                schema: "button@1" as const,
                                props: {
                                  label,
                                  action: {
                                    type: "score.upsert@1" as const,
                                    inputs: {
                                      traceId: "trace-checkout",
                                      name: "checkout_quality",
                                      value,
                                    },
                                  },
                                },
                              })),
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
        chartRows: {},
      },
      1,
    ),
    onExecuteAction: fn(async () => undefined),
    renderEmbed: (kind, resourceId, variableName) => (
      <ResourceEmbedFixture
        key={`${kind}:${resourceId}`}
        kind={kind}
        resourceId={resourceId}
        variableName={variableName}
      />
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const trace = within(
      canvas.getByRole("region", { name: "Trace workspace" }),
    );
    await userEvent.type(
      trace.getByRole("textbox", { name: "Search observations" }),
      "Create",
    );
    await userEvent.click(trace.getByRole("button", { name: /Create order/ }));
    await expect(
      trace.getByText("PAYMENT_DECLINED — no order was created."),
    ).toBeVisible();
    const search = trace.getByRole("textbox", { name: "Search observations" });
    await userEvent.clear(search);
    await userEvent.click(
      trace.getByRole("button", { name: /Authorize payment/ }),
    );
    await expect(trace.getByText(/insufficient_funds/)).toBeVisible();
    await userEvent.click(
      trace.getByRole("button", { name: /Generate customer reply/ }),
    );
    await expect(trace.getByText(/Your order is confirmed!/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Good" }));
    await expect(await canvas.findByText("Saved rating: Good.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Bad" }));
    await expect(await canvas.findByText("Saved rating: Bad.")).toBeVisible();
    await expect(
      canvas.queryByText("Saved rating: Good."),
    ).not.toBeInTheDocument();
    await expect(args.onExecuteAction).toHaveBeenCalledWith(
      {
        type: "score.upsert@1" as const,
        inputs: {
          traceId: "trace-checkout",
          name: "checkout_quality",
          value: 0,
        },
      },
      "rate-bad",
    );
  },
});
export const SupportDashboard = meta.story({
  args: startingArgs(supportDashboard, 1),
});
export const PromptExperiments = meta.story({
  args: startingArgs(promptExperiments, 1),
  decorators: [
    (Story) => (
      <div className="md:[&_[data-notebook-table]]:col-span-full md:[&_div:has(>[data-notebook-table])]:grid md:[&_div:has(>[data-notebook-table])]:grid-cols-2">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const variablesToolbar = () =>
      canvas.queryByRole("group", { name: "Notebook variables" });
    await expect(variablesToolbar()).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Date range" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("combobox", { name: "Run" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getAllByText("Select Run to view this chart."),
    ).toHaveLength(2);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Baseline" }));
    const charts = canvas.getAllByRole("figure");
    await expect(charts).toHaveLength(2);
    for (const chart of charts) {
      await expect(within(chart).getByText("Chart filters")).toBeVisible();
      await expect(within(chart).getByText("Run: Baseline")).toBeVisible();
      await expect(within(chart).getByText(/^Date range:/)).toBeVisible();
    }
    await userEvent.click(
      canvas.getByRole("checkbox", {
        name: "Show element-controlled variables",
      }),
    );
    const runInput = canvas.getByRole("combobox", { name: "Run" });
    await expect(runInput).toHaveTextContent("Baseline");
    await userEvent.click(runInput);
    const options = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await options.findByRole("option", { name: "Compact retrieval" }),
    );
    await expect(
      canvas.getByRole("checkbox", { name: "Compact retrieval" }),
    ).toBeChecked();
    await expect(
      canvas.getByRole("checkbox", { name: "Baseline" }),
    ).not.toBeChecked();
    await expect(canvas.getAllByText("Run: Compact retrieval")).toHaveLength(2);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Policy-first answers" }),
    );
    await expect(canvas.getAllByText("Run: Policy-first answers")).toHaveLength(
      2,
    );
    await expect(canvas.queryByText("Run: Baseline")).not.toBeInTheDocument();
    await expect(runInput).toHaveTextContent("Policy-first answers");
    await userEvent.click(
      canvas.getByRole("checkbox", {
        name: "Show element-controlled variables",
      }),
    );
    await expect(variablesToolbar()).toBeVisible();
    await expect(
      canvas.queryByRole("combobox", { name: "Run" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getAllByText("Run: Policy-first answers")).toHaveLength(
      2,
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Policy-first answers" }),
    );
    await expect(
      canvas.getAllByText("Select Run to view this chart."),
    ).toHaveLength(2);
  },
});
