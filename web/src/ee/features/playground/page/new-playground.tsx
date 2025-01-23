import { useState } from "react";
import ModelView from "./components/ModelView";
import { v4 as uuid } from "uuid";
import { PlusIcon } from "lucide-react";

export default function NewPlayground() {
  const [currentModels, setCurrentModels] = useState<string[]>([uuid()]);

  const addModel = (): void => {
    setCurrentModels((prev) => {
      const newId = uuid();
      const newModels = [...prev];
      newModels.push(newId);
      return newModels;
    });
  };

  const removeModel = (id: string): void => {
    setCurrentModels((prev) => {
      return [...prev].filter((model) => model !== id);
    });
  };

  return (
    <div className="flex h-full flex-row">
      <div className="flex h-full w-full space-x-4 overflow-auto">
        {currentModels.map((modelId) => (
          <ModelView
            key={modelId}
            onRemove={() => removeModel(modelId)}
            isRemoveButtonDisabled={currentModels.length === 1}
          />
        ))}
        <AddModelButton onClick={addModel} />
      </div>
      {/* <div className="max-h-full min-h-0 basis-1/4 pr-2">
        <div className="grid h-full grid-rows-[minmax(20dvh,max-content),minmax(20dvh,auto)] overflow-auto">
          <div className="mb-4 max-h-[80dvh] min-h-[20dvh] overflow-y-auto">
            <ModelParameters {...playgroundContext} />
          </div>
          <div className="min-h-[20dvh]">
            <Variables />
          </div>
        </div>
      </div> */}
    </div>
  );
}

const AddModelButton: React.FC<JSX.IntrinsicElements["button"]> = (props) => {
  return (
    <button
      {...props}
      className="flex h-full min-w-12 items-center justify-center bg-gray-100 disabled:cursor-not-allowed"
    >
      <PlusIcon aria-hidden="true" className="h-6 w-6 text-gray-300" />
    </button>
  );
};
