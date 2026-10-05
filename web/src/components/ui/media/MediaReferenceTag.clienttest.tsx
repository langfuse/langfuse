import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaReferenceTag } from "./MediaReferenceTag";
import { classifyMediaValue } from "./mediaUtils";

const { resolveExternalMediaQueryMock } = vi.hoisted(() => ({
  resolveExternalMediaQueryMock: vi.fn(() => ({
    isError: true,
    data: undefined,
  })),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    media: {
      resolveExternalMedia: {
        useQuery: resolveExternalMediaQueryMock,
      },
    },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: "project-1" } }),
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => true,
}));

vi.mock("./useResolvedMedia", () => ({
  useResolvedMedia: () => ({
    status: "ready",
    url: "data:text/plain,original%20oversized%20field",
    contentLength: 2.5 * 1024 * 1024,
  }),
}));

describe("MediaReferenceTag", () => {
  it("quietly shows the original S3 reference when media is unavailable", () => {
    const uri = "s3://customer-bucket/path/to/missing-image.jpeg";
    const descriptor = classifyMediaValue(uri);

    expect(descriptor).not.toBeNull();
    render(<MediaReferenceTag descriptor={descriptor!} />);

    fireEvent.click(screen.getByRole("button", { name: "JPEG media" }));

    expect(screen.getByText(uri)).toBeInTheDocument();
    expect(resolveExternalMediaQueryMock).toHaveBeenCalledWith(
      { projectId: "project-1", uri },
      expect.objectContaining({
        meta: { silentHttpCodes: [404] },
      }),
    );
  });

  it("keeps focus on the media trigger when resolution starts", () => {
    const descriptor = classifyMediaValue(
      "@@@langfuseMedia:type=image/png|id=image|source=bytes@@@",
    );

    expect(descriptor).not.toBeNull();
    render(<MediaReferenceTag descriptor={descriptor!} />);

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
    render(<MediaReferenceTag descriptor={descriptor!} />);

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
