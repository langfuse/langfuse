import Header from "@/src/app/shell/layouts/header";
import { ConnectedModelDefinitionsTable } from "@/src/ai/model-catalog/ModelDefinitionsTable/ConnectedModelDefinitionsTable";

export function ModelsSettings(props: { projectId: string }) {
  return (
    <>
      <Header title="Model Definitions" />
      <p className="mb-2 text-sm">
        A configuration that stores pricing information for an LLM model. Model
        definitions specify the cost per input and output token, enabling
        Langfuse to automatically calculate the price of generations based on
        token usage.
      </p>
      <ConnectedModelDefinitionsTable projectId={props.projectId} />
    </>
  );
}
