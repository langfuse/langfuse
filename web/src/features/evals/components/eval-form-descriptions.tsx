import DocPopup from "@/src/components/layouts/doc-popup";
import { Label } from "@/src/components/ui/label";

export function VariableMappingDescription(p: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="flex w-1/2 items-center">
      <Label className="muted-foreground text-sm font-light">{p.title}</Label>
      <DocPopup description={p.description} href={p.href} />
    </div>
  );
}

export function TimeScopeDescription(props: {
  projectId: string;
  timeScope: ("NEW" | "EXISTING")[] | undefined;
  target: "trace" | "dataset_item" | undefined;
}) {
  if (!props.timeScope || props.timeScope.length === 0) {
    return "Select a time scope to run this configuration on.";
  }

  const isDatasetTarget = props.target === "dataset_item";
  const targetDescription = isDatasetTarget ? "dataset experiments" : "traces";
  const itemDescription = isDatasetTarget ? "experiment runs" : "traces";

  return (
    <div>
      This evaluator will run on{" "}
      {props.timeScope?.includes("NEW") && props.timeScope?.includes("EXISTING")
        ? "all future and existing"
        : props.timeScope?.includes("NEW")
          ? "all future"
          : "all existing"}{" "}
      {itemDescription} that match these filters.{" "}
      {isDatasetTarget && (
        <span className="text-muted-foreground">
          Note: Dataset evaluators are triggered when {targetDescription} are
          executed, not when the evaluator is created.
        </span>
      )}
    </div>
  );
}
