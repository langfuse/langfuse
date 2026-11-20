import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaButtonGroup } from "./MediaButtonGroup";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import {
  MediaContentType,
  MediaEnabledFields,
} from "@/src/features/media/validation";

const mocks = vi.hoisted(() => ({
  validateImage: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    media: {
      getById: {
        useQuery: () => ({
          data: { url: "http://127.0.0.1:9000/media/image.png" },
        }),
      },
    },
    utilities: { validateImgUrl: { useQuery: mocks.validateImage } },
  },
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project",
}));

describe("MediaButtonGroup", () => {
  it("previews trusted private HTTP storage without arbitrary-URL validation", async () => {
    render(
      <MediaButtonGroup
        media={[
          {
            mediaId: "image",
            contentType: MediaContentType.PNG,
            contentLength: 100,
            url: "http://127.0.0.1:9000/media/image.png",
            urlExpiry: "2099-01-01T00:00:00Z",
            field: MediaEnabledFields.Input,
          },
        ]}
      />,
      { wrapper: LayerProvider },
    );

    fireEvent.mouseEnter(screen.getByTitle("1 image file"));

    expect(await screen.findByAltText("Media preview")).toHaveAttribute(
      "src",
      "http://127.0.0.1:9000/media/image.png",
    );
    expect(screen.queryByRole("button", { name: "Load Image" })).toBeNull();
    expect(mocks.validateImage).not.toHaveBeenCalled();
  });
});
