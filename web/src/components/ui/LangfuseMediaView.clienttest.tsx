/* eslint-disable @repo/prefer-stories-over-client-tests */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExternalMediaView, LangfuseMediaView } from "./LangfuseMediaView";

const { featureEnabled, resolveExternalMediaQueryMock } = vi.hoisted(() => ({
  featureEnabled: { value: true },
  resolveExternalMediaQueryMock: vi.fn(() => ({
    data: {
      url: "https://signed.example.com/photo.jpeg",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  })),
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("@/src/features/feature-flags", () => ({
  useIsFeatureEnabled: () => featureEnabled.value,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    media: {
      getById: {
        useQuery: () => ({ data: undefined }),
      },
      resolveExternalMedia: {
        useQuery: resolveExternalMediaQueryMock,
      },
    },
  },
}));

vi.mock("@/src/components/ui/resizable-image", () => ({
  COMPACT_IMAGE_MAX_HEIGHT_REM: 16,
  ResizableImage: ({ src }: { src: string }) => (
    <div data-testid="resolved-media-image" data-src={src} />
  ),
}));

vi.mock("./media/useResolvedMedia", () => ({
  useResolvedMedia: () => ({ status: "idle", url: undefined }),
}));

const descriptor = {
  kind: "s3",
  contentType: "image/jpeg",
  uri: "s3://customer-bucket/media/photo.jpeg",
} as const;

describe("ExternalMediaView", () => {
  afterEach(() => {
    featureEnabled.value = true;
    resolveExternalMediaQueryMock.mockClear();
  });

  it("eagerly resolves and expands an S3 image", () => {
    render(<ExternalMediaView descriptor={descriptor} />);

    expect(resolveExternalMediaQueryMock).toHaveBeenCalledWith(
      { projectId: "project-1", uri: descriptor.uri },
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.getByTestId("resolved-media-image")).toHaveAttribute(
      "data-src",
      "https://signed.example.com/photo.jpeg",
    );
    expect(
      screen.getByRole("button", {
        name: "Open photo.jpeg in new tab",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "JPEG media" }),
    ).not.toBeInTheDocument();
  });

  it("shows the S3 URI without mounting the resolver when disabled", () => {
    featureEnabled.value = false;

    render(<ExternalMediaView descriptor={descriptor} />);

    expect(screen.getByText(descriptor.uri)).toBeInTheDocument();
    expect(resolveExternalMediaQueryMock).not.toHaveBeenCalled();
  });
});

describe("LangfuseMediaView", () => {
  it("renders a field-limit reference as an attachment", () => {
    render(
      <LangfuseMediaView mediaReferenceString="@@@langfuseMedia:type=text/plain|id=oversized-field|source=field_size_limit@@@" />,
    );

    expect(
      screen.getByRole("button", { name: "Full value attached media" }),
    ).toBeInTheDocument();
  });
});
