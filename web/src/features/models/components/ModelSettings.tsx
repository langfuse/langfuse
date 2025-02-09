import Header from "@/src/components/layouts/header";
import ModelTable from "@/src/components/table/use-cases/models";

export function ModelsSettings(props: { projectId: string }) {
  return (
    <>
      <Header title="Models" level="h3" />
      <p className="mb-4 text-sm">
        A model represents a LLM model. It is used to calculate tokens and cost.
      </p>
      <ModelTable projectId={props.projectId} />
    </>
  );
}
