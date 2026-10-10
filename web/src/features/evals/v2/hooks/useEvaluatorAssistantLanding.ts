import { useEffect, useRef } from "react";

import {
  activateInAppAgentContextualLanding,
  registerInAppAgentContextualLanding,
  type InAppAgentContextualLanding,
} from "@/src/features/in-app-agent";

export function useEvaluatorAssistantLanding({
  projectId,
  landing,
}: {
  projectId: string;
  landing: InAppAgentContextualLanding | null;
}) {
  const onSubmitRef = useRef(landing?.onSubmit);
  onSubmitRef.current = landing?.onSubmit;
  const landingId = landing?.id;
  const title = landing?.title;
  const description = landing?.description;
  const examples = landing?.examples;
  const placeholder = landing?.placeholder;

  useEffect(() => {
    if (!landingId || !title || !description || !examples) {
      return;
    }

    return registerInAppAgentContextualLanding(projectId, {
      id: landingId,
      title,
      description,
      examples,
      placeholder,
      onSubmit: (input) =>
        onSubmitRef.current?.(input) ?? Promise.resolve(false),
    });
  }, [description, examples, landingId, placeholder, projectId, title]);

  return () =>
    landingId
      ? activateInAppAgentContextualLanding(projectId, landingId)
      : false;
}
