import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { VariableMapping } from "./VariableMapping";
import { useVariableMappingController } from "./useVariableMappingController";

function PreviewToTreeSelection() {
  const variableMapping = useVariableMappingController();
  const [sampleSelected, setSampleSelected] = useState(false);

  return (
    <div {...variableMapping.boundaryProps}>
      <VariableMapping
        mode="editable"
        mappings={[
          {
            variable: "expected_output",
            fieldState: {
              selectedColumnId: "output",
              jsonSelector: "$.answer",
            },
          },
        ]}
        {...variableMapping.mappingProps}
        onChangeField={() => undefined}
        sourceObject={{
          input: "Where is my order?",
          output: { answer: "Your order arrives tomorrow." },
        }}
        hasMatchingObservations
      />
      <button type="button" onClick={() => setSampleSelected(true)}>
        Select sample observation
      </button>
      {sampleSelected ? <p>Sample selected</p> : null}
    </div>
  );
}

describe("VariableMapping", () => {
  it("opens the tree from the preview and marks the current mapping", () => {
    render(<PreviewToTreeSelection />);

    const header = screen
      .getByText("{{expected_output}}")
      .closest<HTMLElement>("button");
    expect(header).not.toBeNull();
    if (!header) throw new Error("Expected the mapping header to be clickable");
    fireEvent.click(header);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Change mapping for {{expected_output}}",
      }),
    );

    // Reopening the tree flags the node the variable pulls from today.
    const currentMarker = screen.getByTitle(
      "{{expected_output}} currently pulls from here",
    );
    expect(currentMarker.closest("button")).toHaveTextContent("answer");
  });

  it("returns to preview without interrupting outside actions", () => {
    render(<PreviewToTreeSelection />);

    fireEvent.click(screen.getByTitle("Change the mapping"));
    expect(
      screen.getByTitle("Cancel — keep the current mapping"),
    ).toBeVisible();

    fireEvent.click(screen.getByTitle("Cancel — keep the current mapping"));
    expect(screen.queryByTitle("Cancel — keep the current mapping")).toBeNull();
    expect(screen.getByText("Your order arrives tomorrow.")).toBeVisible();

    fireEvent.click(screen.getByTitle("Change the mapping"));
    fireEvent.keyDown(screen.getByText(/Click rows to open them/), {
      key: "Escape",
    });
    expect(screen.queryByTitle("Cancel — keep the current mapping")).toBeNull();
    expect(screen.getByText("Your order arrives tomorrow.")).toBeVisible();

    fireEvent.click(screen.getByTitle("Change the mapping"));
    fireEvent.click(
      screen.getByRole("button", { name: "Select sample observation" }),
    );
    expect(screen.queryByTitle("Cancel — keep the current mapping")).toBeNull();
    expect(screen.getByText("Your order arrives tomorrow.")).toBeVisible();
    expect(screen.getByText("Sample selected")).toBeVisible();
  });
});
