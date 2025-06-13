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

  if (props.target === "dataset_item") {
    return (
      <div>
        This evaluator will run automatically when dataset experiments are
        executed and will score{" "}
        {props.timeScope?.includes("NEW") &&
        props.timeScope?.includes("EXISTING")
          ? "all traces from future and existing"
          : props.timeScope?.includes("NEW")
            ? "all traces from future"
            : "all traces from existing"}{" "}
        dataset run items that match these filters. <strong>Note:</strong>{" "}
        Creating this evaluator will not run it immediately - it will be
        triggered when you run dataset experiments.
      </div>
    );
  }

  return (
    <div>
      This configuration will target{" "}
      {props.timeScope?.includes("NEW") && props.timeScope?.includes("EXISTING")
        ? "all future and existing"
        : props.timeScope?.includes("NEW")
          ? "all future"
          : "all existing"}{" "}
      {props.target === "trace" ? "traces" : "dataset run items"} that match
      these filters.{" "}
    </div>
  );
}
