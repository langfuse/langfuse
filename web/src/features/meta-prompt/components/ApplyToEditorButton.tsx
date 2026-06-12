import React from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { useMetaPromptContext } from "@/src/features/meta-prompt/context/MetaPromptProvider";

export const ApplyToEditorButton: React.FC = () => {
  const { latestImprovedPrompt, applyToEditor } = useMetaPromptContext();

  return (
    <Button
      variant="secondary"
      onClick={applyToEditor}
      disabled={!latestImprovedPrompt}
      className="w-full"
    >
      <ArrowRight className="mr-2 h-4 w-4" />
      Apply to editor
    </Button>
  );
};
