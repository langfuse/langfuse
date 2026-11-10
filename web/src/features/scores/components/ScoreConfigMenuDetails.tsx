import { type ScoreConfigDataType } from "@langfuse/shared";
import { formatScoreRange } from "@/src/features/scores/lib/helpers";

const scoreDataTypeLabels = {
  NUMERIC: "Numeric",
  CATEGORICAL: "Categorical",
  BOOLEAN: "Boolean",
  TEXT: "Text",
} satisfies Record<ScoreConfigDataType, string>;

export function ScoreConfigMenuDetails({
  config,
}: {
  config: {
    name: string;
    dataType: ScoreConfigDataType;
    description?: string | null;
    minValue?: number | null;
    maxValue?: number | null;
    categories?: { label: string }[] | null;
  };
}) {
  const description = config.description?.trim();
  const range = formatScoreRange(config.minValue, config.maxValue);
  const categoryLabels =
    (config.categories ?? []).map((category) => category.label).join(" · ") ||
    "None";
  const scale = {
    NUMERIC: {
      label: "Range",
      value: range === "Enter a number" ? "Any number" : range,
    },
    TEXT: { label: "Input", value: "Free text" },
    CATEGORICAL: { label: "Categories", value: categoryLabels },
    BOOLEAN: { label: "Categories", value: categoryLabels },
  }[config.dataType];

  return (
    <div className="ph-no-capture flex flex-col gap-1.5 text-xs">
      <p className="text-foreground font-bold wrap-break-word">{config.name}</p>
      <p
        className={
          description ? "whitespace-pre-line" : "text-muted-foreground italic"
        }
      >
        {description || "No description"}
      </p>
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t pt-1.5">
        <dt>Type</dt>
        <dd className="text-foreground">
          {scoreDataTypeLabels[config.dataType]}
        </dd>
        <dt>{scale.label}</dt>
        <dd className="text-foreground">{scale.value}</dd>
      </dl>
    </div>
  );
}
