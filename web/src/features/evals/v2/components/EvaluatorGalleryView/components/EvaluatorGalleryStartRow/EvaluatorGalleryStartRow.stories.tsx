import { expect, fn, userEvent } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGalleryStartRow } from "./EvaluatorGalleryStartRow";

const meta = preview.meta({
  component: EvaluatorGalleryStartRow,
  decorators: [
    (Story) => (
      <div className="@container w-full">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({
  args: { onCreateFromScratch: fn() },
});

export const CreatesDecisionModel = meta.story({
  name: "(Test) Starts a blank decision model",
  args: { onCreateFromScratch: fn() },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("NEW")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: /^Decision model/ }),
    );
    await expect(args.onCreateFromScratch).toHaveBeenCalledWith(
      EvalTemplateTypeEnum.DECISION_MODEL,
    );
  },
});
