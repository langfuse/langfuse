import { Input } from "../ui/input";
import { SelectItem } from "../ui/select";
import { Textarea } from "../ui/textarea";
import type {
  EvaluationStrategy,
  EvaluationStrategyConfigs,
  JudgeOutputType,
  TextMatcherOperator,
} from "./spielwieseEvaluationPaneConfig";
import {
  ConfigCopy,
  ConfigField,
  ConfigLabel,
  ConfigSelect,
  ThresholdConfigInputs,
} from "./spielwieseEvaluationPaneFields";

const judgeVariableChips = [
  { id: "input", label: "{{input}}" },
  { id: "output", label: "{{output}}" },
  { id: "expected-output", label: "{{expected_output}}" },
  { id: "metadata", label: "{{metadata}}" },
] as const;

function JudgeConfig({
  config,
  onUpdate,
}: {
  config: EvaluationStrategyConfigs["llm-judge"];
  onUpdate: (patch: Partial<EvaluationStrategyConfigs["llm-judge"]>) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {judgeVariableChips.map((chip) => (
          <span
            className="border-border/50 text-foreground/62 rounded-full border bg-[rgba(255,255,255,0.82)] px-2 py-0.5 text-[11px] font-medium"
            data-testid={`spielwiese-evaluation-variable-chip-${chip.id}`}
            key={chip.id}
          >
            {chip.label}
          </span>
        ))}
      </div>
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_11rem]">
        <ConfigField className="flex min-w-0 flex-col gap-1.5">
          <ConfigLabel>Judge prompt</ConfigLabel>
          <Textarea
            aria-label="Judge prompt"
            className="border-border/50 bg-background min-h-[5.75rem] rounded-[10px] px-3 py-2 text-[13px] leading-5 shadow-none focus-visible:ring-0"
            placeholder="Tell the judge what good output looks like."
            value={config.judgePrompt}
            onChange={(event) => onUpdate({ judgePrompt: event.target.value })}
          />
        </ConfigField>
        <ConfigField className="flex min-w-0 flex-col gap-1.5">
          <ConfigLabel>Output</ConfigLabel>
          <ConfigSelect
            ariaLabel="Output score type"
            value={config.outputType}
            onValueChange={(value) =>
              onUpdate({ outputType: value as JudgeOutputType })
            }
          >
            <SelectItem value="boolean">Boolean</SelectItem>
            <SelectItem value="numeric">Numeric</SelectItem>
            <SelectItem value="categorical">Categorical</SelectItem>
          </ConfigSelect>
          <ConfigCopy>
            Ask for the judge prompt plus the score shape Langfuse needs to
            persist.
          </ConfigCopy>
        </ConfigField>
      </div>
    </div>
  );
}

function ThresholdConfigSection({
  copy,
  config,
  labels,
  unitOptions,
  onUpdate,
}: {
  copy: string;
  config:
    | EvaluationStrategyConfigs["cost"]
    | EvaluationStrategyConfigs["latency"]
    | EvaluationStrategyConfigs["response-length"];
  labels: {
    comparator: string;
    input: string;
    unit: string;
  };
  unitOptions: readonly string[];
  onUpdate: (patch: Partial<typeof config>) => void;
}) {
  return (
    <div className="grid gap-2">
      <ThresholdConfigInputs
        comparatorAriaLabel={labels.comparator}
        comparatorValue={config.thresholdOperator}
        inputAriaLabel={labels.input}
        inputValue={config.thresholdValue}
        unitAriaLabel={labels.unit}
        unitOptions={unitOptions}
        unitValue={config.thresholdUnit}
        onComparatorChange={(value) => onUpdate({ thresholdOperator: value })}
        onInputChange={(value) => onUpdate({ thresholdValue: value })}
        onUnitChange={(value) => onUpdate({ thresholdUnit: value })}
      />
      <ConfigCopy>{copy}</ConfigCopy>
    </div>
  );
}

function JavaScriptConfig({
  config,
  onUpdate,
}: {
  config: EvaluationStrategyConfigs["javascript"];
  onUpdate: (patch: Partial<EvaluationStrategyConfigs["javascript"]>) => void;
}) {
  return (
    <div className="grid gap-2">
      <ConfigField className="flex min-w-0 flex-col gap-1.5">
        <ConfigLabel>Evaluator code</ConfigLabel>
        <Textarea
          aria-label="JavaScript evaluator code"
          className="border-border/50 bg-background min-h-[5.75rem] rounded-[10px] px-3 py-2 font-mono text-[12px] leading-5 shadow-none focus-visible:ring-0"
          placeholder='return output.includes("refund") ? 1 : 0;'
          value={config.code}
          onChange={(event) => onUpdate({ code: event.target.value })}
        />
      </ConfigField>
      <ConfigCopy>
        Supply the JavaScript that evaluates the response and returns the score
        you want.
      </ConfigCopy>
    </div>
  );
}

function TextMatcherConfig({
  config,
  onUpdate,
}: {
  config: EvaluationStrategyConfigs["text-matcher"];
  onUpdate: (patch: Partial<EvaluationStrategyConfigs["text-matcher"]>) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <ConfigField className="flex w-[9.25rem] min-w-0 flex-col gap-1.5">
          <ConfigLabel>Operator</ConfigLabel>
          <ConfigSelect
            ariaLabel="Text matcher operator"
            value={config.matcherOperator}
            onValueChange={(value) =>
              onUpdate({ matcherOperator: value as TextMatcherOperator })
            }
          >
            <SelectItem value="contains">contains</SelectItem>
            <SelectItem value="equals">equals</SelectItem>
            <SelectItem value="starts with">starts with</SelectItem>
          </ConfigSelect>
        </ConfigField>
        <ConfigField className="flex min-w-[13rem] flex-1 flex-col gap-1.5">
          <ConfigLabel>Expected text</ConfigLabel>
          <Input
            aria-label="Text matcher value"
            className="border-border/50 bg-background h-8 rounded-[10px] px-2.5 text-[13px] shadow-none focus-visible:ring-0"
            placeholder="refund"
            value={config.matcherValue}
            onChange={(event) => onUpdate({ matcherValue: event.target.value })}
          />
        </ConfigField>
      </div>
      <ConfigCopy>
        Checks whether the generated output matches the phrase you care about.
      </ConfigCopy>
    </div>
  );
}

function renderStrategyConfig(
  strategy: EvaluationStrategy,
  config: EvaluationStrategyConfigs[EvaluationStrategy["id"]],
  onUpdate: (
    patch: Partial<EvaluationStrategyConfigs[EvaluationStrategy["id"]]>,
  ) => void,
) {
  switch (strategy.id) {
    case "llm-judge":
      return <JudgeConfig config={config} onUpdate={onUpdate} />;
    case "cost":
      return (
        <ThresholdConfigSection
          config={config}
          copy="Compares Langfuse's observed response cost against your budget."
          labels={{
            comparator: "Cost comparator",
            input: "Cost threshold",
            unit: "Cost threshold unit",
          }}
          unitOptions={["USD", "EUR"]}
          onUpdate={onUpdate}
        />
      );
    case "latency":
      return (
        <ThresholdConfigSection
          config={config}
          copy="Compares time-to-full-response against a maximum acceptable latency."
          labels={{
            comparator: "Latency comparator",
            input: "Latency threshold",
            unit: "Latency threshold unit",
          }}
          unitOptions={["ms", "s"]}
          onUpdate={onUpdate}
        />
      );
    case "response-length":
      return (
        <ThresholdConfigSection
          config={config}
          copy="Checks the output length in the unit you care about."
          labels={{
            comparator: "Response length comparator",
            input: "Response length threshold",
            unit: "Response length unit",
          }}
          unitOptions={["tokens", "words", "characters"]}
          onUpdate={onUpdate}
        />
      );
    case "javascript":
      return <JavaScriptConfig config={config} onUpdate={onUpdate} />;
    case "text-matcher":
      return <TextMatcherConfig config={config} onUpdate={onUpdate} />;
  }
}

export function EvaluationStrategyDetail({
  config,
  nodesCount,
  onUpdate,
  strategy,
}: {
  config: EvaluationStrategyConfigs[EvaluationStrategy["id"]];
  nodesCount: number;
  onUpdate: (
    patch: Partial<EvaluationStrategyConfigs[EvaluationStrategy["id"]]>,
  ) => void;
  strategy: EvaluationStrategy;
}) {
  return (
    <div
      className="border-border/40 flex flex-col gap-3 rounded-[12px] border bg-[#FBFBFB] px-3 py-3"
      data-testid="spielwiese-evaluation-strategy-detail"
    >
      <div className="flex items-center gap-2">
        <p className="text-foreground text-sm font-medium">{strategy.label}</p>
        <span className="text-foreground/54 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium tracking-[0.04em] uppercase">
          {nodesCount} steps
        </span>
      </div>
      <p className="text-foreground/58 text-[12px] leading-5">
        {strategy.description}
      </p>
      {renderStrategyConfig(strategy, config, onUpdate)}
    </div>
  );
}
