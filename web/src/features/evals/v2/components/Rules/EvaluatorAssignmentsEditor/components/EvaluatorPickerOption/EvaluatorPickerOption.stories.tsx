import preview from "../../../../../../../../../.storybook/preview";
import { EvaluatorPickerOption } from "./EvaluatorPickerOption";

const meta = preview.meta({ component: EvaluatorPickerOption });

export const WithLongName = meta.story({
  render: (args) => (
    <div className="w-fit max-w-3xl">
      <EvaluatorPickerOption {...args} />
    </div>
  ),
  args: {
    evaluator: {
      id: "evaluator-1",
      name: "Correctness evaluator for detailed customer support responses across multiple product areas",
      type: "LLM_AS_JUDGE",
      updatedAt: new Date("2026-09-28T09:00:00.000Z"),
      createdByUser: {
        name: "Demo User",
        email: "demo@example.com",
      },
      defaultVariableMapping: [],
      initialVariableMapping: null,
    },
  },
});
