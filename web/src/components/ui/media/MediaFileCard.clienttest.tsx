import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaFileCard } from "./MediaFileCard";

const OFFICE_CONTENT_TYPES = [
  ["application/msword", "DOC"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "DOCX",
  ],
  ["application/vnd.ms-excel", "XLS"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "XLSX"],
] as const;

describe("MediaFileCard", () => {
  it.each(OFFICE_CONTENT_TYPES)(
    "renders %s as %s while keeping the MIME type in the title",
    (contentType, label) => {
      render(
        <MediaFileCard
          contentType={contentType}
          fileName="document"
          onClick={vi.fn()}
        />,
      );

      const labelElement = screen.getByText(label);
      expect(labelElement).toHaveAttribute("title", contentType);
      expect(labelElement).not.toHaveClass("truncate");
    },
  );

  it("renders FILE when the MIME subtype is empty", () => {
    render(
      <MediaFileCard
        contentType="text/"
        fileName="attachment"
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("FILE")).toHaveAttribute("title", "text/");
  });
});
