/* eslint-disable @repo/prefer-stories-over-client-tests */
import { render, screen } from "@testing-library/react";
import { ScoreDataTypeEnum } from "@langfuse/shared";
import { describe, expect, it, vi } from "vitest";

import { ScoreOutputSection } from "./ScoreOutputSection";

describe("ScoreOutputSection", () => {
  it("marks empty category placeholders with the blocking reason", () => {
    render(
      <ScoreOutputSection
        state={{
          dataType: ScoreDataTypeEnum.CATEGORICAL,
          choices: [{ label: "" }, { label: "" }],
          shouldAllowMultipleMatches: false,
          minValue: "",
          maxValue: "",
        }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getAllByLabelText("Warning: Category names cannot be empty."),
    ).toHaveLength(2);
  });
});
