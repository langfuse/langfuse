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
