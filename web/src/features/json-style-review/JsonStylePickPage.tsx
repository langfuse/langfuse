import { useRouter } from "next/router";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { cn } from "@/src/utils/tailwind";
import {
  describeJsonShape,
  FINALIST_JSON_TABLE_STYLE_VARIANTS,
  JSON_TABLE_STYLES,
  type JsonTableDataClass,
  type JsonTableStyleVariant,
  LONG_CONTENT_JSON_TABLE_STYLE_VARIANT,
  useShowJsonTableStylePicker,
} from "@/src/components/ui/jsonTableStyleVariants";
import {
  agentStateFixture,
  attributesFixture,
  chatInput54Fixture,
  chatInputFixture,
  datasetItemFixture,
  longStringFixture,
  modelParametersFixture,
  objectOutputFixture,
  otelMetadataFixture,
  rawTextFixture,
  retrieverOutputFixture,
  shortStringFixture,
  toolDefinitionsFixture,
  typicalMetadataFixture,
} from "./jsonStyleFixtures";

/** Variant the split puts on flat facts; `LONG_CONTENT_JSON_TABLE_STYLE_VARIANT`
    takes everything that reads as content. */
const SPLIT_FACTS_VARIANT: JsonTableStyleVariant = "dense-dotbreak";

const TABLE = JSON_TABLE_STYLES[SPLIT_FACTS_VARIANT].label;
const TREE = JSON_TABLE_STYLES[LONG_CONTENT_JSON_TABLE_STYLE_VARIANT].label;

/** Outcome of the review rounds for one direction on one fixture (review-v1
    verdict table, 620px panel). */
type Verdict = {
  outcome: "works" | "strained" | "breaks";
  reason: string;
};

type UseCase = {
  id: string;
  title: string;
  /** Share of production data this shape stands for (prod-eu 24h sample). */
  share: string;
  viewTitle: string;
  /** facts (metadata, attributes, parameters) or io (input, output, messages). */
  dataClass: JsonTableDataClass;
  json: unknown;
  stress?: boolean;
  /** Review verdicts for the Table and Tree columns; Current has none. */
  verdicts: { table: Verdict; tree: Verdict };
};

// Same fixtures, order and share labels as /dev/json-styles. Bare ChatML
// arrays and bare strings go to the chat / markdown renderers, so those
// fixtures are wrapped in an object to reach the table view.
const USE_CASES: UseCase[] = [
  {
    id: "typical-metadata",
    title: "Typical metadata",
    share:
      "metadata, 99.6% of observations look like this: 3 plain keys, one nested value (p50 3 keys, 620 chars)",
    viewTitle: "Metadata",
    dataClass: "facts",
    json: typicalMetadataFixture,
    verdicts: {
      table: { outcome: "works", reason: "144px, parent row shows 3 keys" },
      tree: { outcome: "works", reason: "168px, leaf dots add noise" },
    },
  },
  {
    id: "chat-input",
    title: "Chat input (6)",
    share:
      "generation input, 61% are chat arrays: p50 2 messages, 8k chars (wrapped in an object; bare arrays use the chat renderer)",
    viewTitle: "Input",
    dataClass: "io",
    json: { messages_in: chatInputFixture },
    verdicts: {
      table: { outcome: "strained", reason: "626px, 105px dead key column" },
      tree: { outcome: "breaks", reason: "collapsed messages read {2 items}" },
    },
  },
  {
    id: "object-output",
    title: "Object output",
    share:
      "generation output, 61% are objects: p50 3 keys, 69% with a nested value",
    viewTitle: "Output",
    dataClass: "io",
    json: objectOutputFixture,
    verdicts: {
      table: { outcome: "works", reason: "375px" },
      tree: { outcome: "works", reason: "378px" },
    },
  },
  {
    id: "model-parameters",
    title: "Model parameters",
    share: "model parameters: p50 4 keys, p95 9, only 8% nested",
    viewTitle: "Model parameters",
    dataClass: "facts",
    json: modelParametersFixture,
    verdicts: {
      table: { outcome: "works", reason: "266px" },
      tree: { outcome: "works", reason: "308px" },
    },
  },
  {
    id: "attributes",
    title: "Attributes",
    share: "trace attributes: six fixed keys",
    viewTitle: "Attributes",
    dataClass: "facts",
    json: attributesFixture,
    verdicts: {
      table: { outcome: "works", reason: "143px" },
      tree: { outcome: "works", reason: "168px" },
    },
  },
  {
    id: "dataset-item",
    title: "Dataset item",
    share: "dataset item: input and expected output objects",
    viewTitle: "Dataset item",
    dataClass: "io",
    json: datasetItemFixture,
    verdicts: {
      table: { outcome: "works", reason: "500px" },
      tree: { outcome: "works", reason: "506px" },
    },
  },
  {
    id: "tool-definitions",
    title: "Tool definitions",
    share:
      "tool definitions: two OpenAI function tools with nested JSON schema",
    viewTitle: "Tools",
    dataClass: "io",
    json: { tools: toolDefinitionsFixture },
    verdicts: {
      table: { outcome: "works", reason: "82px" },
      tree: { outcome: "strained", reason: "{2 items} hides the tool name" },
    },
  },
  {
    id: "strings",
    title: "Long string, short string, raw text",
    share:
      "10% of inputs are raw text (p50 740 chars); 18% of outputs are null or raw text (wrapped in an object)",
    viewTitle: "Output",
    dataClass: "io",
    json: {
      answer: longStringFixture,
      status: shortStringFixture,
      raw_input: rawTextFixture,
    },
    verdicts: {
      table: { outcome: "strained", reason: "683px, keys still a column" },
      tree: { outcome: "works", reason: "679px" },
    },
  },
  {
    id: "chat-input-54",
    title: "Chat input (54)",
    share: "stress: chat input at p95, 54 messages (wrapped in an object)",
    viewTitle: "Input",
    dataClass: "io",
    json: { messages_in: chatInput54Fixture },
    stress: true,
    verdicts: {
      table: { outcome: "works", reason: "collapsed root, 1 row" },
      tree: { outcome: "works", reason: "collapsed root, 1 row" },
    },
  },
  {
    id: "large-array",
    title: "Large array",
    share: "stress: retriever output, 20 documents",
    viewTitle: "Output",
    dataClass: "io",
    json: retrieverOutputFixture,
    stress: true,
    verdicts: {
      table: { outcome: "works", reason: "collapsed" },
      tree: { outcome: "works", reason: "collapsed" },
    },
  },
  {
    id: "deep-nesting",
    title: "Deep nesting",
    share: "stress: agent state, five levels with mixed arrays",
    viewTitle: "Metadata",
    dataClass: "facts",
    json: agentStateFixture,
    stress: true,
    verdicts: {
      table: { outcome: "works", reason: "270px, parents show N keys" },
      tree: { outcome: "works", reason: "308px" },
    },
  },
  {
    id: "otel-metadata",
    title: "OTel dotted metadata",
    share:
      "stress: all-dotted OTel metadata, 35 keys (0.3% of observations mix dotted keys; all-dotted is rare)",
    viewTitle: "Metadata",
    dataClass: "facts",
    json: otelMetadataFixture,
    stress: true,
    verdicts: {
      table: { outcome: "works", reason: "keys wrap at dots" },
      tree: { outcome: "works", reason: "1172px, keys whole" },
    },
  },
];

/** Verdict of the review rounds for a finalist on this fixture; Current and
    the split column have none. */
function verdictFor(
  useCase: UseCase,
  variant: JsonTableStyleVariant,
): Verdict | undefined {
  if (variant === SPLIT_FACTS_VARIANT) return useCase.verdicts.table;
  if (variant === LONG_CONTENT_JSON_TABLE_STYLE_VARIANT) {
    return useCase.verdicts.tree;
  }
  return undefined;
}

/** What Auto renders for this fixture and the shape rule that decided it. */
function splitFor(json: unknown): {
  variant: JsonTableStyleVariant;
  chose: string;
} {
  const shape = describeJsonShape(json);
  return shape.dataClass === "facts"
    ? { variant: SPLIT_FACTS_VARIANT, chose: `chose ${TABLE}: ${shape.reason}` }
    : {
        variant: LONG_CONTENT_JSON_TABLE_STYLE_VARIANT,
        chose: `chose ${TREE}: ${shape.reason}`,
      };
}

/** One rendering of a fixture: heading and plain-language description above
    the framed view, the review verdict below it. */
function StyleColumn({
  heading,
  description,
  note,
  verdict,
  useCase,
  variant,
}: {
  heading: string;
  description: string;
  /** Muted note next to the heading (what the split picked). */
  note?: string;
  /** Review verdict shown under the table. */
  verdict?: Verdict;
  useCase: UseCase;
  variant: JsonTableStyleVariant;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-col gap-0.5 text-xs">
        <div className="font-bold">
          {heading}
          {note ? (
            <span className="text-muted-foreground ml-2 font-normal">
              {note}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 rounded-md border p-2">
        <PrettyJsonView
          json={useCase.json}
          title={useCase.viewTitle}
          currentView="pretty"
          dataClass={useCase.dataClass}
          styleVariant={variant}
          lockStyleVariant
        />
      </div>
      {verdict ? (
        <p
          className="text-muted-foreground truncate text-xs"
          title={`${verdict.outcome}: ${verdict.reason}`}
        >
          {verdict.outcome}: {verdict.reason}
        </p>
      ) : null}
    </div>
  );
}

/** Dev-only pick between the three finalist JSON table directions, plus the
    Auto split as a fourth column. `?wide=1` sizes each column like a wide
    (1000px) panel instead of the default ~620px side panel. */
export function JsonStylePickPage() {
  const available = useShowJsonTableStylePicker();
  const router = useRouter();
  const wide = router.query.wide === "1";
  if (!available) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        Not available in production.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <nav className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-xs">
        <span className="font-bold">JSON styles: pick</span>
        {USE_CASES.map((useCase) => (
          <a
            key={useCase.id}
            href={`#${useCase.id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {useCase.title}
          </a>
        ))}
      </nav>
      <p className="text-muted-foreground border-b px-4 py-2 text-xs">
        Pick one of three. The fourth column shows the optional split.
      </p>
      {USE_CASES.map((useCase) => {
        const split = splitFor(useCase.json);
        return (
          <section
            key={useCase.id}
            id={useCase.id}
            className="flex scroll-mt-10 flex-col gap-3 border-b px-4 py-6"
          >
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-bold">
                {useCase.title}
                {useCase.stress ? (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    stress case
                  </span>
                ) : null}
              </h2>
              <p className="text-muted-foreground text-xs">{useCase.share}</p>
            </div>
            <div
              className={cn(
                "grid gap-4",
                wide
                  ? "grid-cols-[repeat(auto-fill,minmax(960px,1fr))]"
                  : "grid-cols-[repeat(auto-fill,minmax(560px,1fr))]",
              )}
            >
              {FINALIST_JSON_TABLE_STYLE_VARIANTS.map((variant) => (
                <StyleColumn
                  key={variant}
                  heading={JSON_TABLE_STYLES[variant].label}
                  description={JSON_TABLE_STYLES[variant].reference}
                  verdict={verdictFor(useCase, variant)}
                  useCase={useCase}
                  variant={variant}
                />
              ))}
              <StyleColumn
                heading={`Auto (${TABLE} or ${TREE} by content)`}
                description={`Picks per table: ${TABLE} for fact sheets (flat, short values), ${TREE} for content (lists, long text, deep nesting)`}
                note={split.chose}
                useCase={useCase}
                variant={split.variant}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
