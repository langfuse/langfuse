// @vitest-environment jsdom

import type { PostHogConfig } from "posthog-js";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  QueryInput,
  useQueryInputController,
} from "@/src/components/design-system/QueryInput/QueryInput";
import { LayerContainerProvider } from "@/src/context/LayerContext/LayerContext";
import { ComposerWithPreview } from "@/src/features/search-bar/components/ComposerWithPreview";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer/SearchComposer";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

const { initMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    init: initMock,
  },
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: vi.fn(),
}));

describe("PostHog session replay privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    initMock.mockReset();
  });

  it("blocks observed search values outside the masked input", () => {
    function ControlledQueryInput() {
      const controller = useQueryInputController();
      return (
        <QueryInput
          label="Query"
          placeholder="Filter…"
          value=""
          tokens={[]}
          diagnostics={[]}
          onValueChange={vi.fn()}
          onCommit={vi.fn()}
          onRemoveToken={vi.fn()}
          areEquivalent={(left, right) => left === right}
          controller={controller}
          completions={{
            loading: false,
            autoHighlight: false,
            options: [
              {
                id: "private-option",
                label: "private-search-value",
                edit: {
                  next: "private-search-value",
                  caret: 20,
                  keepOpen: false,
                },
                onApplied: vi.fn(),
              },
            ],
          }}
        />
      );
    }
    render(
      <LayerContainerProvider name="popover" container={document.body}>
        <ControlledQueryInput />
      </LayerContainerProvider>,
    );
    fireEvent.focus(screen.getByRole("combobox", { name: "Query" }));

    expect(
      screen.getByText("private-search-value").closest(".ph-no-capture"),
    ).not.toBeNull();
  });

  it("blocks draft and preview attributes outside the contenteditable", () => {
    const store = createSearchBarStore();
    store.getState().actions.setDraft("private-draft");
    store.getState().actions.setPreview("private-preview");
    const { rerender } = render(
      <SearchBarStoreProvider store={store} commit={vi.fn()}>
        <SearchComposer observed={undefined} />
      </SearchBarStoreProvider>,
    );
    expect(
      screen.getByTestId("search-bar-surface").closest(".ph-no-capture"),
    ).not.toBeNull();
    rerender(
      <SearchBarStoreProvider store={store} commit={vi.fn()}>
        <ComposerWithPreview observed={undefined} />
      </SearchBarStoreProvider>,
    );
    expect(
      screen.getByTestId("search-bar-preview").closest(".ph-no-capture"),
    ).not.toBeNull();
  });

  it("records regular UI text while masking input values", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "EU");

    await import("@/src/pages/_app");

    expect(initMock).toHaveBeenCalledTimes(1);
    const config = initMock.mock.calls[0]![1] as Partial<PostHogConfig>;
    expect(config.session_recording).toMatchObject({
      maskAllInputs: true,
      blockClass: "ph-no-capture",
    });
    expect(config.session_recording?.maskTextSelector).toBe(
      '[contenteditable="true"]',
    );
    expect(config.disable_session_recording).toBe(false);
  });

  // Stronger than disabling the recorder: the HIPAA region runs no product
  // analytics at all, so there is no PostHog client to record with. The wider
  // region gate lives in posthog-product-analytics-region.clienttest.ts.
  it("initializes no PostHog client in the HIPAA cloud region", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "HIPAA");

    await import("@/src/pages/_app");

    expect(initMock).not.toHaveBeenCalled();
  });

  it("disables session recording outside Langfuse Cloud", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "");

    await import("@/src/pages/_app");

    expect(initMock).toHaveBeenCalledTimes(1);
    const config = initMock.mock.calls[0]![1] as Partial<PostHogConfig>;
    expect(config.disable_session_recording).toBe(true);
  });
});
