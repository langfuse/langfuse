import { fireEvent, render, screen, within } from "@testing-library/react";

import { SampleDataTreeSelector } from "./SampleDataTreeSelector";

vi.mock("@/src/components/MediaTag/MediaTag", () => ({
  MediaTag: ({ contentType }: { contentType: string }) => (
    <span data-testid="media-tag">{contentType}</span>
  ),
}));

describe("SampleDataTreeSelector", () => {
  const reference =
    "@@@langfuseMedia:type=image/png|id=media-1|source=bytes@@@";

  it("renders scalar Langfuse media references as media tags", () => {
    render(
      <SampleDataTreeSelector
        variable="input"
        roots={[
          {
            id: "input",
            label: "Input",
            value: { attachment: reference },
          },
        ]}
        currentColumnId={null}
        currentSegments={null}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Input/i }));

    const attachmentRow = screen
      .getByRole("button", { name: /attachment/i })
      .closest("div");
    expect(attachmentRow).not.toBeNull();
    expect(within(attachmentRow!).getByTestId("media-tag")).toHaveTextContent(
      "image/png",
    );
    expect(
      within(attachmentRow!).queryByText(reference),
    ).not.toBeInTheDocument();
  });

  it("renders media tags inside wildcard object previews", () => {
    render(
      <SampleDataTreeSelector
        variable="input"
        roots={[
          {
            id: "input",
            label: "Input",
            value: {
              attachments: [
                {
                  filename: "cache-hit-ratio.png",
                  media: reference,
                },
              ],
            },
          },
        ]}
        currentColumnId={null}
        currentSegments={null}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Input/i }));
    fireEvent.click(screen.getByRole("button", { name: /attachments/i }));

    const wildcardRow = screen
      .getByRole("button", { name: /\[\*\]/i })
      .closest("div");
    expect(wildcardRow).not.toBeNull();
    expect(within(wildcardRow!).getByTestId("media-tag")).toHaveTextContent(
      "image/png",
    );
    expect(within(wildcardRow!).queryByText(reference)).not.toBeInTheDocument();
  });
});
