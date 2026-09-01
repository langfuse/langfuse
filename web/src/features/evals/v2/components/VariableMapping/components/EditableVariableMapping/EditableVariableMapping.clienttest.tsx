import { render, screen } from "@testing-library/react";

import { EditableVariableMapping } from "./EditableVariableMapping";

vi.mock("@/src/components/MediaTag/MediaTag", () => ({
  MediaTag: ({ contentType }: { contentType: string }) => (
    <span data-testid="media-tag">{contentType}</span>
  ),
}));

describe("EditableVariableMapping", () => {
  it("renders a mapped Langfuse media reference as an aligned media tag", () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=media-1|source=bytes@@@";

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
        sourceObject={{ input: reference }}
        hasMatchingObservations
      />,
    );

    expect(screen.getByTestId("media-tag")).toHaveTextContent("image/png");
    expect(screen.queryByText(reference)).not.toBeInTheDocument();
    expect(screen.getByTestId("mapped-media-preview")).toHaveClass(
      "items-center",
    );
  });
});
