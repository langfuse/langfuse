import { fireEvent, render, screen } from "@testing-library/react";

import { EditableVariableMapping } from "./EditableVariableMapping";

vi.mock("@/src/components/ui/media/MediaReferenceTag", () => ({
  MediaReferenceTag: ({
    descriptor,
  }: {
    descriptor: { kind: string; mediaId?: string; contentType: string };
  }) => (
    <button type="button" data-media-tag="" data-testid="resolved-media-tag">
      {descriptor.kind}:{descriptor.mediaId}:{descriptor.contentType}
    </button>
  ),
}));

const reference = "@@@langfuseMedia:type=image/png|id=media-1|source=bytes@@@";

const renderMapping = (
  state: "preview" | "editing",
  onActiveMappingChange = vi.fn(),
) =>
  render(
    <EditableVariableMapping
      mappings={[
        {
          variable: "input",
          fieldState: { selectedColumnId: "input", jsonSelector: null },
        },
      ]}
      activeMapping={{ variable: "input", state }}
      onActiveMappingChange={onActiveMappingChange}
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

  it("does not enter editing when the mapped media trigger is used", () => {
    const onActiveMappingChange = vi.fn();
    renderMapping("preview", onActiveMappingChange);

    const mediaTag = screen.getByTestId("resolved-media-tag");
    fireEvent.click(mediaTag);
    fireEvent.keyDown(mediaTag, { key: "Enter" });

    expect(onActiveMappingChange).not.toHaveBeenCalled();
  });

  it("resolves a Langfuse media reference in the sample data tree", () => {
    renderMapping("editing");

    const mediaTag = screen.getByTestId("resolved-media-tag");
    expect(mediaTag).toHaveTextContent("langfuseRef:media-1:image/png");
    expect(mediaTag.closest("[title]")).toBeNull();
    expect(
      mediaTag.closest("div")?.querySelector("button"),
    ).not.toHaveAttribute("title");
  });
});
