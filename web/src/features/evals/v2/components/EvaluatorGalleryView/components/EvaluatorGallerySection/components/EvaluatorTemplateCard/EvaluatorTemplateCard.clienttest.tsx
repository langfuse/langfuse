import { render, screen } from "@testing-library/react";
import {
  EvalTemplateSourceCodeLanguageEnum,
  EvalTemplateTypeEnum,
} from "@langfuse/shared";

import { EvaluatorTemplateCard } from "./EvaluatorTemplateCard";

describe("EvaluatorTemplateCard", () => {
  it("credits the maintainer of a managed template", () => {
    render(
      <EvaluatorTemplateCard
        template={{
          source: "managed",
          key: "hallucination",
          name: "Hallucination",
          category: "quality",
          icon: "alert-triangle",
          description: "Detects ungrounded claims.",
          maintainer: "ragas",
          evaluator: {
            type: EvalTemplateTypeEnum.CODE,
            language: EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT,
            source: "return true",
          },
        }}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("Detects ungrounded claims.")).toBeInTheDocument();
    expect(screen.getByText("by Ragas")).toBeInTheDocument();
  });

  it("names the language of a custom code evaluator that has no prompt", () => {
    render(
      <EvaluatorTemplateCard
        template={{
          source: "custom",
          id: "evaluator-1",
          name: "Exact match",
          type: EvalTemplateTypeEnum.CODE,
          prompt: null,
          sourceCodeLanguage: EvalTemplateSourceCodeLanguageEnum.PYTHON,
          updatedAt: new Date("2026-07-01"),
          version: 3,
          createdByUser: null,
        }}
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByText("Python evaluator · version 3"),
    ).toBeInTheDocument();
  });
});
