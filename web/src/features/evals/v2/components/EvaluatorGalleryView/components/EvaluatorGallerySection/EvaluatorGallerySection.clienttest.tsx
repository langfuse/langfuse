import { fireEvent, render, screen } from "@testing-library/react";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { EvaluatorGallerySection } from "./EvaluatorGallerySection";

describe("EvaluatorGallerySection", () => {
  it("offers to expand when more project evaluators exist than were loaded", () => {
    const onExpandedChange = vi.fn();

    render(
      <EvaluatorGallerySection
        section={{
          key: "custom",
          label: "Your Examples",
          description: "Project evaluators",
          totalCount: 12,
          templates: [
            {
              source: "custom",
              id: "evaluator-1",
              name: "Exact match",
              type: EvalTemplateTypeEnum.CODE,
              prompt: null,
              updatedAt: new Date("2026-08-11"),
              version: 1,
            },
          ],
        }}
        expanded={false}
        onExpandedChange={onExpandedChange}
        onSelectTemplate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /show all 12/i }));

    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
});
