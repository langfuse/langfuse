import { type ComponentProps } from "react";
import { buildNotebookPath } from "@langfuse/shared";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { readingColumnClassName } from "@/src/components/layouts/reading-column";
import { notebookLayoutSchema } from "@/src/features/notebooks/schema";
import { cn } from "@/src/utils/tailwind";
import { NotebookChart } from "../NotebookChart/NotebookChart";
import { NotebookVersionHistory } from "../NotebookVersionHistory/NotebookVersionHistory";
import { issueTracker } from "@/.storybook/fixtures/notebooks/issueTracker";
import { monitorInvestigation } from "@/.storybook/fixtures/notebooks/monitorInvestigation";
import { promptExperiments } from "@/.storybook/fixtures/notebooks/promptExperiments";
import { type NotebookFixture } from "@/.storybook/fixtures/notebooks/supportAssistantFixtures";
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
    url:
      version === null
        ? buildNotebookPath({
            projectId: "storybook",
            notebookId: fixture.id,
            draftDocumentId: id,
          })
        : buildNotebookPath({
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
            propertySchema: fixture.propertySchema,
            document: {
              title: document.title,
              properties: document.properties,
            },
          }
        : {
            kind: fixture.layout,
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
    width: document.width ?? "contained",
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
    renderChart: (block) => (
      <NotebookChart
        block={block}
        state={{ type: "ready", rows: fixture.chartRows[block.id] ?? [] }}
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
                args.view.layout.kind !== "table" &&
                readingColumnClassName,
            )}
          >
            <h1 className="min-w-0 truncate text-base font-bold">
              {args.fixture.title}
            </h1>
            {args.view.isDraft && <Badge text="Draft" size="sm" />}
            <div className="ml-auto shrink-0">
              <NotebookVersionHistory
                view={args.view}
                onVersionChange={(version) => {
                  updateArgs({
                    view: fixtureView(args.fixture, version, null),
                    tableDocumentOpen: false,
                  });
                  args.onVersionChange(version);
                }}
              />
            </div>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <NotebookReader
            view={args.view}
            tableDocumentOpen={args.tableDocumentOpen}
            isLoadingDocument={args.isLoadingDocument}
            renderChart={args.renderChart}
            onDocumentChange={(documentId, version) => {
              updateArgs({
                view: fixtureView(args.fixture, version, documentId),
                tableDocumentOpen: documentId !== null,
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
export const SupportDashboard = meta.story({
  args: startingArgs(supportDashboard, 1),
});
export const PromptExperiments = meta.story({
  args: startingArgs(promptExperiments, 1),
});
