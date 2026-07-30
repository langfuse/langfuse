import { render, screen } from "@testing-library/react";
import { MediaContentType } from "@langfuse/shared";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/components/ui/LangfuseMediaView", () => ({
  LangfuseMediaView: () => <div data-testid="media-item" />,
}));

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { LARGE_STRING_RENDER_CHAR_LIMIT } from "@/src/components/ui/largeStringGate";
import { MediaEnabledFields } from "@/src/features/media/validation";

describe("PrettyJsonView media layout", () => {
  it("aligns attachment tiles with the section content", () => {
    render(
      <PrettyJsonView
        json={"x".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1)}
        title="Output"
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
      />,
    );

    expect(screen.getByTestId("media-item").parentElement).toHaveClass("px-2");
  });
});
