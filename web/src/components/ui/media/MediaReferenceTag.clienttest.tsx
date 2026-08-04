import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaReferenceTag } from "./MediaReferenceTag";
import { classifyMediaValue } from "./mediaUtils";

vi.mock("./useResolvedMedia", () => ({
  useResolvedMedia: () => ({
    status: "ready",
    url: "data:text/plain,original%20oversized%20field",
    contentLength: 2.5 * 1024 * 1024,
  }),
}));

describe("MediaReferenceTag", () => {
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
