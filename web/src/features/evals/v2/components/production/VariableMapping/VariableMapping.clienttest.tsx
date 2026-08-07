import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

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

    const currentRow = screen
      .getByText("current")
      .closest<HTMLElement>("[role=button]");
    expect(currentRow).not.toBeNull();
    if (!currentRow) throw new Error("Expected a current mapping row");
    expect(within(currentRow).getByText("answer")).toBeInTheDocument();

    const toolbar = screen
      .getByText(/Click rows to open them/)
      .closest<HTMLElement>("div");
    expect(toolbar).not.toBeNull();
    if (!toolbar) throw new Error("Expected the tree explanation toolbar");
    expect(
      toolbar.compareDocumentPosition(currentRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("returns to preview without interrupting outside actions", () => {
    render(<PreviewToTreeSelection />);

    const editButton = screen.getByTitle("Change the mapping");
    fireEvent.click(editButton);
    expect(
      screen.getByTitle("Cancel — keep the current mapping"),
    ).toBeVisible();

    fireEvent.click(screen.getByTitle("Cancel — keep the current mapping"));
    expect(screen.queryByTitle("Cancel — keep the current mapping")).toBeNull();
    expect(screen.getByText("Your order arrives tomorrow.")).toBeVisible();

    fireEvent.click(screen.getByTitle("Change the mapping"));

    expect(
      document.activeElement?.closest("[data-variable-mapping-root]"),
    ).not.toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, {
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

  it("renders compact and full variants for long read-only paths", () => {
    render(
      <VariableMapping
        mode="read-only"
        mappings={[
          {
            variable: "input",
            fieldState: {
              selectedColumnId: "input",
              jsonSelector: "$.customer.support.tickets[*].messages[*].content",
            },
          },
        ]}
      />,
    );

    const binding = document.querySelector<HTMLElement>(
      "[data-variable-mapping-binding]",
    );
    expect(binding).not.toBeNull();
    if (!binding) throw new Error("Expected a read-only mapping binding");
    expect(binding).toHaveAttribute(
      "title",
      "Input > customer > support > tickets > [*] > messages > [*] > content",
    );
    const truncated = binding.querySelector<HTMLElement>(
      "[data-path-variant=truncated]",
    );
    const compact = binding.querySelector<HTMLElement>(
      "[data-path-variant=compact]",
    );
    const full = binding.querySelector<HTMLElement>("[data-path-variant=full]");
    expect(truncated).not.toBeNull();
    expect(compact).not.toBeNull();
    expect(full).not.toBeNull();
    if (!truncated || !compact || !full) {
      throw new Error("Expected responsive path variants");
    }
    expect(truncated).not.toHaveClass("truncate");
    expect(truncated).toHaveTextContent("Input...");
    expect(truncated.querySelector("svg")).not.toBeNull();
    expect(truncated.textContent?.match(/\.\.\./g)).toHaveLength(1);
    expect(within(compact).getByText("...")).toBeInTheDocument();
    expect(within(compact).getByText("content").parentElement).toHaveClass(
      "shrink-0",
    );
    expect(within(full).getByText("customer")).toBeInTheDocument();

    expect(screen.getByText("{{input}}").parentElement).toHaveClass(
      "min-h-9",
      "bg-secondary",
    );
  });
});
