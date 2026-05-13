import React from "react";

import {
  NewPromptForm,
  type NewPromptFormHandle,
} from "@/src/features/prompts/components/NewPromptForm";
import { ApplyToEditorButton } from "./ApplyToEditorButton";

type PromptEditorPanelProps = {
  promptFormRef: React.RefObject<NewPromptFormHandle | null>;
};

export const PromptEditorPanel: React.FC<PromptEditorPanelProps> = ({
  promptFormRef,
}) => {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mb-4">
        <ApplyToEditorButton />
      </div>

      <NewPromptForm ref={promptFormRef} />
    </div>
  );
};
