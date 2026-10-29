import { JsonViewController } from "@/src/components/ui/JsonViewController";
import { FoldVertical, UnfoldVertical } from "@langfuse/icons";
import { IOSection } from "@/src/components/ui/IOSection";
import { render, screen } from "@testing-library/react";
import { MediaContentType } from "@langfuse/shared";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/components/ui/LangfuseMediaView", () => ({
  LangfuseMediaView: () => <div data-testid="media-item" />,
}));

import { PrettyJsonViewContent } from "@/src/components/ui/PrettyJsonViewContent";
import { LARGE_STRING_RENDER_CHAR_LIMIT } from "@/src/components/ui/largeStringGate";
import { MediaEnabledFields } from "@/src/features/media/validation";

describe("PrettyJsonView media layout", () => {
  it("aligns attachment tiles with the section content", () => {
    render(
      <JsonViewController
        json={"x".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1)}
        media={[
          {
            mediaId: "media-id",
            contentType: MediaContentType.TXT,
            contentLength: 1,
            url: "https://example.com/media.txt",
            urlExpiry: "2099-01-01T00:00:00.000Z",
            field: MediaEnabledFields.Output,
          },
        ]}
      >
        {(state) => (
          <IOSection
            title="Output"
            onCopy={state.copy}
            actions={
              state.contentKind === "table" && state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={state.contentKind === "table" ? "table" : "text"}
          >
            <PrettyJsonViewContent state={state} title="Output" borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    expect(screen.getByTestId("media-item").parentElement).toHaveClass("px-2");
  });
});
