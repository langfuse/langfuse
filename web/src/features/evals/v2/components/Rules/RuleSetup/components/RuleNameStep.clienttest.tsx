import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import { RuleNameStep } from "./RuleNameStep";

describe("RuleNameStep", () => {
  it("starts expanded when the rule does not have a name yet", () => {
    const store = createRuleSetupStore({
      name: "",
      filter: [],
      sampling: 1,
      assignments: [],
    });

    render(
      <RuleNameStep
        store={store}
        nameAIAssistance={{ state: "unavailable" }}
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Step 3: Name rule" }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});
