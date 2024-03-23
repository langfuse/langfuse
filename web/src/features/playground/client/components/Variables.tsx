import { usePlaygroundContext } from "../context";
import { PromptVariableComponent } from "./PromptVariableComponent";

export const Variables = () => {
  const { promptVariables } = usePlaygroundContext();
  const renderNoVariables = () => (
    <div className="text-xs">
      <p className="mb-2">No variables defined.</p>
      <p>
        Use handlebars in your prompts to add a variable:
        &#123;&#123;exampleVariable&#125;&#125;
      </p>
    </div>
  );
  const renderVariables = () => (
    <div className="h-full overflow-auto pr-4">
      {promptVariables
        .sort((a, b) => {
          if (a.isUsed && !b.isUsed) return -1;
          if (!a.isUsed && b.isUsed) return 1;

          return a.name.localeCompare(b.name);
        })
        .map((promptVariable) => {
          return (
            <PromptVariableComponent
              promptVariable={promptVariable}
              key={promptVariable.name}
            />
          );
        })}
    </div>
  );

  return (
    <div className="flex h-full flex-col space-y-4">
      <p className="font-semibold">Variables</p>
      {promptVariables.length === 0 ? renderNoVariables() : renderVariables()}
    </div>
  );
};
