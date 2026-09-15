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
      className="text-muted-foreground inline-flex h-auto items-baseline gap-1 px-0 py-0 align-baseline font-normal"
      aria-haspopup={props.mode === "edit" ? "dialog" : undefined}
      onClick={props.onClick}
    >
      <span>or describe what should change</span>
      <BotMessageSquare
        aria-hidden="true"
        className="inline-block h-4 w-4 align-text-bottom"
      />
    </Button>
  );
}
