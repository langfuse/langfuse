import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JsonMediaTag } from "./JsonMediaTag";
import { classifyMediaValue } from "./mediaUtils";

vi.mock("./useResolvedMedia", () => ({
  useResolvedMedia: () => ({ status: "idle", url: undefined }),
}));

describe("JsonMediaTag", () => {
  it("renders a bare field-limit media reference as the specialized warning", () => {
    const descriptor = classifyMediaValue(
      "@@@langfuseMedia:type=text/plain|id=oversized-field|source=field_size_limit@@@",
    );

    expect(descriptor).not.toBeNull();
    render(<JsonMediaTag descriptor={descriptor!} />);

    expect(
      screen.getByRole("button", { name: "Field over size limit media" }),
    ).toBeInTheDocument();
  });
});
