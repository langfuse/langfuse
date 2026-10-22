import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaReferenceTag } from "./MediaReferenceTag";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

const { refreshIfNeeded } = vi.hoisted(() => ({
  refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/utils/api", () => ({ api: {} }));
vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));
vi.mock("@/src/features/feature-flags", () => ({
  useIsFeatureEnabled: () => false,
}));
vi.mock("@langfuse/shared", () => ({
  OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE: "field_size_limit",
}));

vi.mock("./useResolvedMedia", () => ({
  useResolvedMedia: () => ({
    status: "ready",
    url: "data:text/plain,original%20oversized%20field",
    contentLength: 2.5 * 1024 * 1024,
    refreshIfNeeded,
  }),
}));

describe("MediaReferenceTag", () => {
  beforeEach(() => {
    refreshIfNeeded.mockClear();
  });

  it("checks the cached URL on both the first open and a later reopen", async () => {
    const descriptor = {
      kind: "langfuseRef",
      contentType: "application/pdf",
      mediaId: "document",
      source: "bytes",
      referenceString:
        "@@@langfuseMedia:type=application/pdf|id=document|source=bytes@@@",
    } as const;
    render(<MediaReferenceTag descriptor={descriptor} />, {
      wrapper: LayerProvider,
    });

    const trigger = screen.getByRole("button", { name: "PDF media" });
    fireEvent.click(trigger);
    expect(refreshIfNeeded).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText("No inline preview")).not.toBeInTheDocument(),
    );
    expect(refreshIfNeeded).toHaveBeenCalledTimes(1);

    fireEvent.click(trigger);
    expect(refreshIfNeeded).toHaveBeenCalledTimes(2);
  });

  it("keeps focus on the media trigger when resolution starts", () => {
    const descriptor = {
      kind: "langfuseRef",
      contentType: "image/png",
      mediaId: "image",
      source: "bytes",
      referenceString:
        "@@@langfuseMedia:type=image/png|id=image|source=bytes@@@",
    } as const;
    render(<MediaReferenceTag descriptor={descriptor} />, {
      wrapper: LayerProvider,
    });

    const trigger = screen.getByRole("button", { name: "PNG media" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(trigger).toHaveFocus();
  });

  it("renders a field-limit media reference as an attachment", () => {
    const descriptor = {
      kind: "langfuseRef",
      contentType: "text/plain",
      mediaId: "oversized-field",
      source: "field_size_limit",
      referenceString:
        "@@@langfuseMedia:type=text/plain|id=oversized-field|source=field_size_limit@@@",
    } as const;
    render(<MediaReferenceTag descriptor={descriptor} />, {
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
