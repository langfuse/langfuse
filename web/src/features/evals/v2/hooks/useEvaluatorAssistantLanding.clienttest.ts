import { getEvaluatorAssistantLanding } from "./useEvaluatorAssistantLanding";

describe("getEvaluatorAssistantLanding", () => {
  it.each([
    {
      mode: "create",
      evaluatorType: "CODE",
      title: "Create a code evaluator with AI",
      placeholder: "Describe what this code evaluator should check...",
    },
    {
      mode: "edit",
      evaluatorType: "CODE",
      title: "Improve this code evaluator",
      placeholder: "Describe how to change this code evaluator...",
    },
    {
      mode: "create",
      evaluatorType: "LLM_AS_JUDGE",
      title: "Create an LLM-as-a-judge evaluator with AI",
      placeholder: "Describe what this judge should evaluate...",
    },
    {
      mode: "edit",
      evaluatorType: "LLM_AS_JUDGE",
      title: "Improve this LLM-as-a-judge evaluator",
      placeholder: "Describe how to change this judge...",
    },
  ] as const)(
    "provides evaluator-specific copy for $mode $evaluatorType",
    ({ mode, evaluatorType, title, placeholder }) => {
      const onSubmit = vi.fn().mockResolvedValue(true);
      const landing = getEvaluatorAssistantLanding({
        id: "evaluator",
        mode,
        evaluatorType,
        onSubmit,
      });

      expect(landing).toMatchObject({
        id: "evaluator",
        title,
        placeholder,
        onSubmit,
      });
      expect(landing.examples).toHaveLength(3);
      expect(landing.examples.every((example) => example.prompt)).toBe(true);
    },
  );
});
