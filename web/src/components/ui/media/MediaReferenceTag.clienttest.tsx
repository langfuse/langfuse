import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaReferenceTag } from "./MediaReferenceTag";
import { classifyMediaValue } from "./mediaUtils";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

const mocks = vi.hoisted(() => ({
  mediaUrl: "http://127.0.0.1:9000/media/image.png",
  sessionStatus: "unauthenticated",
  validateImage: vi.fn((_src: string, options: { enabled: boolean }) => ({
    data: options.enabled ? { isValid: true } : undefined,
    isError: false,
  })),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: mocks.sessionStatus }),
}));

vi.mock("@/src/utils/api", () => ({
  api: { utilities: { validateImgUrl: { useQuery: mocks.validateImage } } },
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project",
}));

vi.mock(
  "@/src/ee/features/external-media-storage/hooks/useHasExternalMediaStorageAccess",
  () => ({ useHasExternalMediaStorageAccess: () => true }),
);

vi.mock("./useResolvedExternalMedia", () => ({
  useResolvedExternalMedia: () => ({
    status: "ready",
    url: mocks.mediaUrl,
    refreshIfNeeded: async () => undefined,
  }),
}));

vi.mock("./useResolvedMedia", () => ({
  useResolvedMedia: () => ({
    status: "ready",
    url: mocks.mediaUrl,
    contentLength: 2.5 * 1024 * 1024,
    refreshIfNeeded: async () => undefined,
  }),
}));

describe("MediaReferenceTag", () => {
  beforeEach(() => {
    mocks.sessionStatus = "unauthenticated";
    mocks.validateImage.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    "@@@langfuseMedia:type=image/png|id=image|source=bytes@@@",
    "s3://customer-bucket/image.png",
    "data:image/png;base64,iVBORw0KGgo=",
  ])(
    "previews trusted media without a session or URL validation: %s",
    (value) => {
      const descriptor = classifyMediaValue(value);
      if (!descriptor) throw new Error("Expected a media descriptor");

      render(<MediaReferenceTag descriptor={descriptor} />, {
        wrapper: LayerProvider,
      });
      fireEvent.click(screen.getByRole("button", { name: "PNG media" }));

      expect(screen.getByAltText("")).toHaveAttribute(
        "src",
        descriptor.kind === "dataUri" ? descriptor.src : mocks.mediaUrl,
      );
      expect(screen.queryByRole("button", { name: "Load Image" })).toBeNull();
      expect(mocks.validateImage).not.toHaveBeenCalled();
    },
  );

  it("requires consent and validation for arbitrary image URLs", () => {
    mocks.sessionStatus = "authenticated";
    const descriptor = classifyMediaValue("https://example.com/image.png");
    if (!descriptor) throw new Error("Expected an image URL descriptor");

    render(<MediaReferenceTag descriptor={descriptor} />, {
      wrapper: LayerProvider,
    });
    fireEvent.click(screen.getByRole("button", { name: "PNG media" }));

    expect(screen.queryByAltText("")).toBeNull();
    expect(mocks.validateImage).toHaveBeenLastCalledWith(
      "https://example.com/image.png",
      { enabled: false },
    );
    fireEvent.click(screen.getByRole("button", { name: "Load Image" }));

    expect(mocks.validateImage).toHaveBeenLastCalledWith(
      "https://example.com/image.png",
      { enabled: true },
    );
    expect(screen.getByAltText("")).toHaveAttribute(
      "src",
      "https://example.com/image.png",
    );
  });

  it("keeps focus on the media trigger when resolution starts", () => {
    const descriptor = classifyMediaValue(
      "@@@langfuseMedia:type=image/png|id=image|source=bytes@@@",
    );

    expect(descriptor).not.toBeNull();
    render(<MediaReferenceTag descriptor={descriptor!} />, {
      wrapper: LayerProvider,
    });

    const trigger = screen.getByRole("button", { name: "PNG media" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(trigger).toHaveFocus();
  });

  it("renders a field-limit media reference as an attachment", () => {
    const descriptor = classifyMediaValue(
      "@@@langfuseMedia:type=text/plain|id=oversized-field|source=field_size_limit@@@",
    );

    expect(descriptor).not.toBeNull();
    render(<MediaReferenceTag descriptor={descriptor!} />, {
      wrapper: LayerProvider,
    });

    const attachment = screen.getByRole("button", {
      name: "Full value attached media",
    });
    fireEvent.click(attachment);

    expect(
      screen.getByText(
        "This field was too large to process inline, so Langfuse saved the complete original value as an attachment at ingestion.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open original" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2.50 MB")).toBeInTheDocument();
  });
});
