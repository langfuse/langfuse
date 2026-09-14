import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  JSON_TABLE_STYLE_VARIANTS,
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

type UseCase = {
  id: string;
  title: string;
  /** Share of production data this shape stands for (prod-eu 24h sample). */
  share: string;
  viewTitle: string;
  json: unknown;
  stress?: boolean;
};

// Bare ChatML arrays and bare strings go to the chat / markdown renderers, so
// those fixtures are wrapped in an object to reach the table view.
const USE_CASES: UseCase[] = [
  {
    id: "typical-metadata",
    title: "Typical metadata",
    share:
      "metadata, 99.6% of observations look like this: 3 plain keys, one nested value (p50 3 keys, 620 chars)",
    viewTitle: "Metadata",
    json: typicalMetadataFixture,
  },
  {
    id: "chat-input",
    title: "Chat input (6)",
    share:
      "generation input, 61% are chat arrays: p50 2 messages, 8k chars (wrapped in an object; bare arrays use the chat renderer)",
    viewTitle: "Input",
    json: { messages_in: chatInputFixture },
  },
  {
    id: "object-output",
    title: "Object output",
    share:
      "generation output, 61% are objects: p50 3 keys, 69% with a nested value",
    viewTitle: "Output",
    json: objectOutputFixture,
  },
  {
    id: "model-parameters",
    title: "Model parameters",
    share: "model parameters: p50 4 keys, p95 9, only 8% nested",
    viewTitle: "Model parameters",
    json: modelParametersFixture,
  },
  {
    id: "attributes",
    title: "Attributes",
    share: "trace attributes: six fixed keys",
    viewTitle: "Attributes",
    json: attributesFixture,
  },
  {
    id: "dataset-item",
    title: "Dataset item",
    share: "dataset item: input and expected output objects",
    viewTitle: "Dataset item",
    json: datasetItemFixture,
  },
  {
    id: "tool-definitions",
    title: "Tool definitions",
    share:
      "tool definitions: two OpenAI function tools with nested JSON schema",
    viewTitle: "Tools",
    json: { tools: toolDefinitionsFixture },
  },
  {
    id: "strings",
    title: "Long string, short string, raw text",
    share:
      "10% of inputs are raw text (p50 740 chars); 18% of outputs are null or raw text (wrapped in an object)",
    viewTitle: "Output",
    json: {
      answer: longStringFixture,
      status: shortStringFixture,
      raw_input: rawTextFixture,
    },
  },
  {
    id: "chat-input-54",
    title: "Chat input (54)",
    share: "stress: chat input at p95, 54 messages (wrapped in an object)",
    viewTitle: "Input",
    json: { messages_in: chatInput54Fixture },
    stress: true,
  },
  {
    id: "large-array",
    title: "Large array",
    share: "stress: retriever output, 20 documents",
    viewTitle: "Output",
    json: retrieverOutputFixture,
    stress: true,
  },
  {
    id: "deep-nesting",
    title: "Deep nesting",
    share: "stress: agent state, five levels with mixed arrays",
    viewTitle: "Metadata",
    json: agentStateFixture,
    stress: true,
  },
  {
    id: "otel-metadata",
    title: "OTel dotted metadata",
    share:
      "stress: all-dotted OTel metadata, 35 keys (0.3% of observations mix dotted keys; all-dotted is rare)",
    viewTitle: "Metadata",
    json: otelMetadataFixture,
    stress: true,
  },
];

/** Dev-only side-by-side review of the JSON table style directions. */
export function JsonStyleReviewPage() {
  const available = useShowJsonTableStylePicker();
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
        <span className="font-bold">JSON styles</span>
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
      {USE_CASES.map((useCase) => (
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            {JSON_TABLE_STYLE_VARIANTS.map((variant) => (
              <div key={variant} className="flex min-w-0 flex-col gap-1">
                <div className="text-muted-foreground font-mono text-xs">
                  {variant}
                </div>
                <div className="min-w-0 rounded-md border p-2">
                  <PrettyJsonView
                    json={useCase.json}
                    title={useCase.viewTitle}
                    currentView="pretty"
                    styleVariant={variant}
                    lockStyleVariant
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
