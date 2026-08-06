import { Button } from "@/src/components/ui/button";
import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorExecutionSelector } from "./EvaluatorExecutionSelector";

const meta = preview.meta({ component: EvaluatorExecutionSelector });

export const LlmJudge = meta.story({
  args: {
    mode: "llm",
    onModeChange: fn(),
    disabled: false,
    children: (
      <>
        <span>with</span>
        <Button variant="outline">OpenAI / gpt-4.1-mini</Button>
      </>
    ),
  },
});

export const Disabled = meta.story({
  args: {
    mode: "code",
    onModeChange: fn(),
    disabled: true,
    children: <span>written in Python</span>,
  },
});
