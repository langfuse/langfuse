import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { EditableVariableMapping } from "./EditableVariableMapping";

describe("EditableVariableMapping", () => {
  it("shows an empty sample warning in the mapping header", () => {
    render(
      <EditableVariableMapping
        mappings={[
          {
            variable: "input",
            fieldState: { selectedColumnId: "input", jsonSelector: null },
          },
        ]}
        activeMapping={{ variable: "input", state: "preview" }}
        onActiveMappingChange={vi.fn()}
        onChangeField={vi.fn()}
        sourceObject={{ input: "" }}
        hasMatchingObservations
      />,
    );

    expect(screen.getByText("empty in the sample")).toHaveClass(
      "text-muted-foreground",
      "italic",
    );
    const warning = screen.getByLabelText(
      "Warning: This mapping is empty in the selected sample.",
    );
    expect(warning).toHaveClass("text-dark-yellow", "self-center", "-top-px");
    expect(warning).toHaveAttribute(
      "title",
      "This mapping is empty in the selected sample.",
    );
    expect(
      screen.getByText("Input").compareDocumentPosition(warning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
