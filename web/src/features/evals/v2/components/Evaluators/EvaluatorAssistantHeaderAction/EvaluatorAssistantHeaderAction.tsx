import type { RefObject } from "react";
import { BotMessageSquare } from "lucide-react";

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
      className="text-muted-foreground inline h-auto px-0 py-0 align-baseline font-normal"
      aria-haspopup={props.mode === "edit" ? "dialog" : undefined}
      onClick={props.onClick}
    >
      <span>or say what should change</span>
      <BotMessageSquare
        aria-hidden="true"
        className="ml-1 inline-block h-4 w-4 align-text-bottom"
      />
    </Button>
  );
}
