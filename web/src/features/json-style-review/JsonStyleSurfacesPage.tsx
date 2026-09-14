import { useRouter } from "next/router";
import { useShowJsonTableStylePicker } from "@/src/components/ui/jsonTableStyleVariants";

/** Seed project; used when the page is opened without a projectId. */
const DEFAULT_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

type Seeded = "seeded" | "no seeded example" | "not a table surface";

type Surface = {
  id: number;
  name: string;
  shows: string;
  edgeCases: string;
  /** Path after /project/{projectId}; absolute when it starts with /dev. */
  href: string | null;
  linkLabel: string;
  reach: string;
  seeded: Seeded;
};

const CODEX_O1 = "/traces/demo-codex-turn-1?observation=demo-codex-turn-1-o1";
const SUPPORT_O1 =
  "/traces/demo-support-s1-t7?observation=demo-support-s1-t7-o1";
const TOXICITY = "/evals/toxicity-job?dateRange=30d";

const SURFACES: Surface[] = [
  {
    id: 1,
    name: "Trace preview Input / Output (IOPreviewPretty)",
    shows: "observation input, output objects; Metadata facts table below",
    edgeCases:
      "small flat objects, key column width vs adjacent Metadata table",
    href: SUPPORT_O1,
    linkLabel: "crm.get-account",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 2,
    name: "Trace root chat + markdown (MarkdownJsonView)",
    shows: "string input/output as markdown, Metadata table",
    edgeCases: "markdown next to a table, no table for strings",
    href: "/traces/demo-support-s1-t7",
    linkLabel: "demo-support-s1-t7",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 3,
    name: "Observation metadata, OTel attributes (IOPreviewPretty Metadata)",
    shows: "35 dotted attributes.* keys, nested attributes.metadata with nulls",
    edgeCases:
      "dotted keys wrapping, null values, nested row expanded, narrow panel",
    href: CODEX_O1,
    linkLabel: "litellm_request",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 4,
    name: "Additional Input (ChatMessageList)",
    shows: "tools array, 5+ nesting levels",
    edgeCases: "deep nesting, collapsed previews",
    href: CODEX_O1,
    linkLabel: "same as 3",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 5,
    name: "Tool definitions (ToolCallDefinitionCard)",
    shows: "tool parameters schema per tool; raw tool uses the JSON view",
    edgeCases:
      "untitled Parameters table keeps the Path / Value header under Table and Tree+",
    href: CODEX_O1,
    linkLabel: 'same as 3, expand "1. functions"',
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 6,
    name: "Tool call invocation (ToolCallInvocationsView)",
    shows: "assistant tool_calls arguments and response",
    edgeCases:
      "untitled Arguments table keeps the Path / Value header under Table and Tree+",
    href: "/traces/support-agent-s42?observation=support-agent-s42-obs-8",
    linkLabel: "llm.chat obs-8",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 7,
    name: "Chat message object content (ChatMessage, MarkdownJsonView passthrough)",
    shows: "tool message content parsed to object",
    edgeCases: "nested array items collapsed",
    href: "/traces/support-agent-s42?observation=support-agent-s42-obs-10",
    linkLabel: "llm.chat obs-10",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 8,
    name: "Status message (StatusMessageSection)",
    shows: "ERROR status_message string",
    edgeCases: "string payload, table style has no effect",
    href: "/traces/demo-codex-turn-1?observation=demo-codex-turn-1-o2",
    linkLabel: "litellm_request o2",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 9,
    name: "Log view expanded rows (LogViewExpandedContent)",
    shows:
      "input / output / metadata per observation as one Path / Value table",
    edgeCases: "values shown as raw JSON strings, long rows",
    href: "/traces/demo-support-s1-t7?traceTab=log",
    linkLabel: "log view, then Expand all",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 10,
    name: "Session timeline parts (SessionTimelinePart)",
    shows: "JSON-only message cards, reasoning data",
    edgeCases:
      "untitled cards keep the Path / Value header under Table and Tree+, markdown inside string values, no toggle on the page",
    href: "/sessions/demo-support-s1",
    linkLabel: 'session, then open a "JSON-only message detected" card',
    reach: "follows stored choice, no toggle here",
    seeded: "seeded",
  },
  {
    id: 11,
    name: "Experiment metadata (ExperimentMetadataSection)",
    shows: "dataset run metadata in the details side panel",
    edgeCases:
      "narrow side panel, one-row seeded metadata, header stays under Table and Tree+",
    href: "/experiments/results?baseline=demo-dataset-run-2-demo-countries-dataset-950dc53a",
    linkLabel: "results, then Show details, Metadata",
    reach: "follows stored choice",
    seeded: "seeded",
  },
  {
    id: 12,
    name: "Variable mapping preview (EditableVariableMapping)",
    shows: "mapped observation field for a sample",
    edgeCases: "preview inside a form card, header stays under Table and Tree+",
    href: TOXICITY,
    linkLabel: 'toxicity, then expand "{{output}} maps to Metadata"',
    reach: "follows stored choice",
    seeded: "seeded",
  },
  {
    id: 13,
    name: "Evaluator test result (TestResultPanelView)",
    shows: "raw evaluator output, JSON view only",
    edgeCases: "unaffected by table styles; needs an LLM connection to run",
    href: TOXICITY,
    linkLabel: "same as 12",
    reach: "JSON view fixed",
    seeded: "no seeded example",
  },
  {
    id: 14,
    name: "Code eval test run card (CodeEvalTestRunCard)",
    shows: "code evaluator input preview",
    edgeCases:
      "needs LANGFUSE_CODE_EVAL_DISPATCHER and a code template; no seeded template",
    href: "/evals/new",
    linkLabel: "new evaluator, pick Code",
    reach: "follows stored choice",
    seeded: "no seeded example",
  },
  {
    id: 15,
    name: "Playground tool call card (ToolCallCard)",
    shows: "tool call args in playground output",
    edgeCases: "needs an LLM connection",
    href: "/playground",
    linkLabel: "playground",
    reach: "follows stored choice",
    seeded: "no seeded example",
  },
  {
    id: 16,
    name: "Dataset item and compare",
    shows: "CodeMirror editors and JSONView code cells",
    edgeCases: "not PrettyJsonView",
    href: "/datasets/demo-countries-dataset-950dc53a/items/dataset-item-demo-countries-dataset-0-950dc53a-0",
    linkLabel: "dataset item",
    reach: "none",
    seeded: "not a table surface",
  },
  {
    id: 17,
    name: "JSON segment (IOPreviewJSONSimple)",
    shows: "raw JSON code block",
    edgeCases: "unaffected by table styles",
    href: SUPPORT_O1,
    linkLabel: "same as 1 with JSON selected",
    reach: "JSON segment",
    seeded: "seeded",
  },
  {
    id: 18,
    name: "Empty object edge",
    shows: "{} input and output",
    edgeCases: "empty table",
    href: "/traces/b82a0bdc1994fc5d1c8576ca032543f7?observation=framework-google-adk-2025-08-28-04290e4d82aba1bc-950dc53a",
    linkLabel: "execute_tool say_hello",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 19,
    name: "Large array edge",
    shows: "items array of 88",
    edgeCases: "collapsed preview vs expanded rows",
    href: "/traces/trace-tree-s42-trace?observation=trace-tree-s42-obs-0",
    linkLabel: "router-agent",
    reach: "toggle on the panel",
    seeded: "seeded",
  },
  {
    id: 20,
    name: "8k string edge",
    shows: "fixture only",
    edgeCases:
      "no seeded 8k string; /dev/json-styles#strings renders the fixture in every style",
    href: "/dev/json-styles#strings",
    linkLabel: "/dev/json-styles#strings",
    reach: "every style side by side on that page",
    seeded: "no seeded example",
  },
];

const COLUMNS = [
  "#",
  "Surface",
  "Shows",
  "Edge cases",
  "Deep link",
  "Toggle reaches it via",
];

function surfaceHref(href: string, projectId: string): string {
  return href.startsWith("/dev") ? href : `/project/${projectId}${href}`;
}

/** Dev-only index of every surface that renders the JSON table, one row
    each, with deep links into seeded data on the current project. */
export function JsonStyleSurfacesPage() {
  const available = useShowJsonTableStylePicker();
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : DEFAULT_PROJECT_ID;
  if (!available) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        Not available in production.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-sm font-bold">JSON table styles in context</h1>
      <p className="text-muted-foreground text-xs">
        Switch style with the Formatted / JSON toggle: Table, Tree+, Tree. The
        choice is stored app-wide (localStorage <code>jsonViewPreference</code>:
        dense-dotbreak, tree-plus, tree, pretty), so pages without a toggle
        follow it after a reload.
      </p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            {COLUMNS.map((column) => (
              <th
                key={column}
                className="text-muted-foreground py-1.5 pr-3 font-normal"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SURFACES.map((surface) => (
            <tr key={surface.id} className="border-b align-top">
              <td className="py-1.5 pr-3">{surface.id}</td>
              <td className="py-1.5 pr-3">
                {surface.name}{" "}
                <span className="text-muted-foreground">{surface.seeded}</span>
              </td>
              <td className="py-1.5 pr-3">{surface.shows}</td>
              <td className="py-1.5 pr-3">{surface.edgeCases}</td>
              <td className="py-1.5 pr-3">
                {surface.href ? (
                  <a
                    className="text-primary underline underline-offset-2"
                    href={surfaceHref(surface.href, projectId)}
                  >
                    {surface.linkLabel}
                  </a>
                ) : (
                  <span className="text-muted-foreground">no link</span>
                )}
              </td>
              <td className="py-1.5 pr-3">{surface.reach}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
