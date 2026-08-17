import { expect, fn, userEvent } from "storybook/test";
import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGallerySidebar } from "./EvaluatorGallerySidebar";
import { EVALUATOR_GALLERY_ALL_SECTION_KEY } from "../../../../constants/evaluatorGallery";

const items = [
  { key: EVALUATOR_GALLERY_ALL_SECTION_KEY, label: "All", count: 21 },
  { key: "custom", label: "Your templates", count: 2 },
  { key: "conversation", label: "Conversational / Chatbots", count: 6 },
  { key: "quality", label: "Quality", count: 5 },
];

const meta = preview.meta({ component: EvaluatorGallerySidebar });

export const Default = meta.story({
  args: {
    items,
    activeSection: EVALUATOR_GALLERY_ALL_SECTION_KEY,
    onSelectSection: fn(),
  },
});

export const YourTemplatesSelected = meta.story({
  args: {
    items,
    activeSection: "custom",
    onSelectSection: fn(),
  },
});

export const SelectsYourTemplates = meta.story({
  name: "(Test) Selects Your templates",
  args: {
    items,
    activeSection: EVALUATOR_GALLERY_ALL_SECTION_KEY,
    onSelectSection: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Your templates 2" }),
    );
    await expect(args.onSelectSection).toHaveBeenCalledWith("custom");
  },
});
