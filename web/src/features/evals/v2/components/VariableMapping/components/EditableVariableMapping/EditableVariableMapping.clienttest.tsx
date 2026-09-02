import { render, screen } from "@testing-library/react";

import { EditableVariableMapping } from "./EditableVariableMapping";

vi.mock("@/src/components/ui/media/MediaReferenceTag", () => ({
  MediaReferenceTag: ({
    descriptor,
  }: {
    descriptor: { kind: string; mediaId?: string; contentType: string };
  }) => (
    <span data-testid="resolved-media-tag">
      {descriptor.kind}:{descriptor.mediaId}:{descriptor.contentType}
    </span>
  ),
}));

const reference = "@@@langfuseMedia:type=image/png|id=media-1|source=bytes@@@";

const renderMapping = (state: "preview" | "editing") =>
  render(
    <EditableVariableMapping
      mappings={[
        {
          variable: "input",
          fieldState: { selectedColumnId: "input", jsonSelector: null },
        },
      ]}
      activeMapping={{ variable: "input", state }}
      onActiveMappingChange={vi.fn()}
      onChangeField={vi.fn()}
      sourceObject={{ input: reference }}
      hasMatchingObservations
    />,
  );

describe("EditableVariableMapping", () => {
  it("resolves a mapped Langfuse media reference in the value preview", () => {
    renderMapping("preview");

    expect(screen.getByTestId("resolved-media-tag")).toHaveTextContent(
      "langfuseRef:media-1:image/png",
    );
    expect(screen.queryByText(reference)).not.toBeInTheDocument();
    expect(screen.getByTestId("mapped-media-preview")).toHaveClass(
      "items-center",
    );
  });

  it("resolves a Langfuse media reference in the sample data tree", () => {
    renderMapping("editing");

    expect(screen.getByTestId("resolved-media-tag")).toHaveTextContent(
      "langfuseRef:media-1:image/png",
    );
  });
});
