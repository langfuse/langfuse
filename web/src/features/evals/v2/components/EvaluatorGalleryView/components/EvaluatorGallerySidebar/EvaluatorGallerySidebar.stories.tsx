import { expect, fn, screen, userEvent } from "storybook/test";
import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGallerySidebar } from "./EvaluatorGallerySidebar";
import { EVALUATOR_GALLERY_ALL_SECTION_KEY } from "../../../../constants/evaluatorGallery";

const items = [
  { key: EVALUATOR_GALLERY_ALL_SECTION_KEY, label: "All", count: 21 },
  { key: "custom", label: "Your templates", count: 2 },
  { key: "conversation", label: "Conversational / Chatbots", count: 6 },
  { key: "quality", label: "Quality", count: 5 },
];

// The sidebar switches between a vertical nav and a select on the @2xl
// container breakpoint, and EvaluatorGalleryView owns the @container it
// measures against. Without one here every container query stays false and
// only the narrow select renders.
const wide = (Story: () => React.ReactElement) => (
  <div className="@container w-[720px]">
    <Story />
  </div>
);

const narrow = (Story: () => React.ReactElement) => (
  <div className="@container w-[380px]">
    <Story />
  </div>
);

const meta = preview.meta({
  component: EvaluatorGallerySidebar,
  decorators: [wide],
});

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

export const NarrowContainer = meta.story({
  decorators: [narrow],
  args: {
    items,
    activeSection: EVALUATOR_GALLERY_ALL_SECTION_KEY,
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

export const SelectsYourTemplatesInNarrowContainer = meta.story({
  name: "(Test) Selects Your templates in a narrow container",
  decorators: [narrow],
  args: {
    items,
    activeSection: EVALUATOR_GALLERY_ALL_SECTION_KEY,
    onSelectSection: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("combobox"));
    // Radix portals the select content out of the story canvas.
    await userEvent.click(
      await screen.findByRole("option", { name: /Your templates/ }),
    );
    await expect(args.onSelectSection).toHaveBeenCalledWith("custom");
  },
});
