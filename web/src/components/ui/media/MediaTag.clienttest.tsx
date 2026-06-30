import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaTag } from "./MediaTag";

describe("MediaTag", () => {
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
});
