import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeTurnstileWidget } from "@/src/features/auth/components/TurnstileWidget";

describe("invokeTurnstileWidget", () => {
  afterEach(() => {
    delete window.turnstile;
    vi.restoreAllMocks();
  });

  it("calls reset when the container is still in the document", () => {
    const reset = vi.fn();
    window.turnstile = { render: vi.fn(), reset, remove: vi.fn() };
    const container = document.createElement("div");
    document.body.appendChild(container);

    invokeTurnstileWidget("reset", "widget-1", container);

    expect(reset).toHaveBeenCalledWith("widget-1");
    container.remove();
  });

  it("skips reset when the container has already been detached", () => {
    const reset = vi.fn();
    window.turnstile = { render: vi.fn(), reset, remove: vi.fn() };
    const container = document.createElement("div");

    invokeTurnstileWidget("reset", "widget-1", container);

    expect(reset).not.toHaveBeenCalled();
  });

  it("skips the API when the widget id was already cleared", () => {
    const remove = vi.fn();
    window.turnstile = { render: vi.fn(), reset: vi.fn(), remove };
    const container = document.createElement("div");
    document.body.appendChild(container);

    invokeTurnstileWidget("remove", null, container);

    expect(remove).not.toHaveBeenCalled();
    container.remove();
  });

  it("swallows Turnstile throwing after the widget is already gone", () => {
    window.turnstile = {
      render: vi.fn(),
      reset: vi.fn(() => {
        throw new Error(
          "[Cloudflare Turnstile] Nothing to reset found for provided container.",
        );
      }),
      remove: vi.fn(),
    };
    const container = document.createElement("div");
    document.body.appendChild(container);

    expect(() =>
      invokeTurnstileWidget("reset", "widget-1", container),
    ).not.toThrow();
    container.remove();
  });
});
