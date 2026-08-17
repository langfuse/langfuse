import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { StringMapEditor } from "./StringMapEditor";

function TestEditor() {
  const [entries, setEntries] = useState<Record<string, string>>({});

  return (
    <StringMapEditor
      title="Model Parameters"
      description="Pricing attributes"
      entries={entries}
      onChange={setEntries}
    />
  );
}

describe("StringMapEditor", () => {
  it("edits exact string keys and values", () => {
    render(<TestEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Add Attribute" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. service_tier"), {
      target: { value: "service_tier" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. priority"), {
      target: { value: "priority" },
    });

    expect(screen.getByDisplayValue("service_tier")).toBeInTheDocument();
    expect(screen.getByDisplayValue("priority")).toBeInTheDocument();
  });
});
