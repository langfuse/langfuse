import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaReferenceTag } from "./MediaReferenceTag";
import { classifyMediaValue } from "./mediaUtils";

vi.mock("./useResolvedMedia", () => ({
  useResolvedMedia: () => ({ status: "idle", url: undefined }),
}));

describe("MediaReferenceTag", () => {
  it("renders a bare field-limit media reference as the specialized warning", () => {
    const descriptor = classifyMediaValue(
      "@@@langfuseMedia:type=text/plain|id=oversized-field|source=field_size_limit@@@",
    );

    expect(descriptor).not.toBeNull();
    render(<MediaReferenceTag descriptor={descriptor!} />);

    expect(
      screen.getByRole("button", { name: "Field over size limit media" }),
    ).toBeInTheDocument();
  });
});
