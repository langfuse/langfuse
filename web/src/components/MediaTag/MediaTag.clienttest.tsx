import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaTag } from "./MediaTag";

const OFFICE_CONTENT_TYPES = [
  ["application/msword", "DOC"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "DOCX",
  ],
  ["application/vnd.ms-excel", "XLS"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "XLSX"],
] as const;

describe("MediaTag", () => {
  it("blocks the portaled preview from PostHog session recordings", () => {
    const description = "customer-provided media description";

    render(
      <MediaTag
        contentType="image/png"
        description={description}
        status="ready"
        url="data:image/png;base64,"
        open
      />,
    );

    expect(screen.getByText(description).parentElement).toHaveClass(
      "ph-no-capture",
    );
  });

  it("stops portaled preview actions from triggering parent clicks", () => {
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <MediaTag
          contentType="image/png"
          status="ready"
          url="data:image/png;base64,"
          open
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Open in new tab" }));

    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("opens the preview on click", async () => {
    const onOpenChange = vi.fn();

    render(
      <MediaTag
        contentType="image/png"
        status="ready"
        url="data:image/png;base64,"
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "PNG media" }));

    expect(await screen.findByText("image/png")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("opens the preview on touch pointer down", async () => {
    const onOpenChange = vi.fn();

    render(
      <MediaTag
        contentType="image/png"
        status="ready"
        url="data:image/png;base64,"
        onOpenChange={onOpenChange}
      />,
    );

    const event = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(screen.getByRole("button", { name: "PNG media" }), event);

    expect(await screen.findByText("image/png")).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("empties the native title while the peek is open so no tooltip overlaps it", () => {
    render(<MediaTag contentType="image/png" status="ready" open />);

    const chip = screen.getByRole("button", { name: "PNG media" });
    expect(chip.querySelector("span")?.getAttribute("title")).toBe("");
  });

  it("keeps the MIME type title while the peek is closed", () => {
    render(<MediaTag contentType="image/png" open={false} />);

    const chip = screen.getByRole("button", { name: "PNG media" });
    expect(chip.querySelector("span")?.getAttribute("title")).toBe("image/png");
  });

  it.each(OFFICE_CONTENT_TYPES)("renders %s as %s", (contentType, label) => {
    render(<MediaTag contentType={contentType} />);

    expect(
      screen.getByRole("button", { name: `${label} media` }),
    ).toBeInTheDocument();
  });

  it("caps generated MIME labels at ten characters", () => {
    const contentType =
      "application/vnd.example.intentionally-verbose-archive-format";
    render(<MediaTag contentType={contentType} />);

    const label = screen.getByRole("button").querySelector("span");
    expect(label).toHaveClass("max-w-[10ch]", "truncate");
    expect(label).toHaveAttribute("title", contentType);
  });

  it("caps the hover card MIME type at twenty characters", () => {
    const contentType =
      "application/vnd.example.intentionally-verbose-archive-format";
    render(<MediaTag contentType={contentType} open />);

    expect(screen.getByTitle(contentType)).toHaveClass(
      "max-w-[20ch]",
      "truncate",
    );
  });

  it("shows the fallback when resolved image media fails to render", async () => {
    render(
      <MediaTag
        contentType="image/jpeg"
        status="ready"
        url="https://commons.wikimedia.org/wiki/File:Gull_portrait_ca_usa.jpg"
        open
      />,
    );

    const image = document.body.querySelector("img");
    expect(image).toBeInTheDocument();

    fireEvent.error(image!);

    expect(await screen.findByText("Failed to load media")).toBeInTheDocument();
  });

  it("renders an attachment with an explicit open action", () => {
    render(
      <MediaTag
        contentType="text/plain"
        status="ready"
        url="https://example.com/oversized.txt"
        label="Full value attached"
        description="This field was too large to process inline, so Langfuse saved the complete original value as an attachment at ingestion."
        openActionLabel="Open original"
        intent="attachment"
        open
      />,
    );

    expect(
      screen.getByRole("button", { name: "Full value attached media" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This field was too large to process inline, so Langfuse saved the complete original value as an attachment at ingestion.",
      ),
    ).toBeInTheDocument();
    const openOriginal = screen.getByRole("link", { name: "Open original" });
    expect(openOriginal).toHaveAttribute(
      "href",
      "https://example.com/oversized.txt",
    );
    expect(openOriginal).toHaveClass("gap-1.5");
  });
});
