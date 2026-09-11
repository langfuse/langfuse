import type { RefObject } from "react";

import { Button } from "@/src/components/ui/button";

type EvaluatorAssistantHeaderActionProps =
  | {
      mode: "create";
      onClick: () => void;
    }
  | {
      mode: "edit";
      triggerRef: RefObject<HTMLButtonElement | null>;
      onClick: () => void;
    };

export function EvaluatorAssistantHeaderAction(
  props: EvaluatorAssistantHeaderActionProps,
) {
  return (
    <Button
      ref={props.mode === "edit" ? props.triggerRef : undefined}
      type="button"
      variant="link"
      size="sm"
      className="text-muted-foreground h-auto px-0 py-0 font-normal"
      aria-haspopup={props.mode === "edit" ? "dialog" : undefined}
      onClick={props.onClick}
    >
      or say what should change
    </Button>
  );
}
