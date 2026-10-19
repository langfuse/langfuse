// @vitest-environment jsdom

import type { PostHogConfig } from "posthog-js";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { InAppAgentQuestionnaireCard } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/InAppAgentQuestionnaireCard";
import { InAppAgentQuestionnaireSummary } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireSummary/InAppAgentQuestionnaireSummary";
import { AutocompleteListbox } from "@/src/features/search-bar/components/AutocompleteListbox";
import { ComposerWithPreview } from "@/src/features/search-bar/components/ComposerWithPreview";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
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
    render(
      createElement(AutocompleteListbox, {
        highlightedId: null,
        plan: {
          stage: "value",
          from: 0,
          to: 0,
          loading: false,
          sections: [
            {
              title: "Observed values",
              options: [
                {
                  id: "private-option",
                  kind: "value",
                  label: "private-search-value",
                  value: "private-search-value",
                },
              ],
            },
          ],
        },
      }),
    );

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

  it("blocks Halo questionnaire questions, options, and submitted answers", () => {
    // The Radix radio group measures its items; jsdom has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { unmount } = render(
      <InAppAgentQuestionnaireCard
        questions={[
          {
            question: "private-question",
            options: [
              {
                label: "private-option-label",
                description: "private-option-description",
                recommended: false,
              },
            ],
            allowMultiple: false,
          },
        ]}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );
    for (const text of [
      "private-question",
      "private-option-label",
      "private-option-description",
    ]) {
      expect(screen.getByText(text).closest(".ph-no-capture")).not.toBeNull();
    }
    fireEvent.click(screen.getByRole("radio", { name: "Type your answer" }));
    fireEvent.change(screen.getByLabelText("Custom answer"), {
      target: { value: "private-other-answer" },
    });
    expect(
      screen
        .getByDisplayValue("private-other-answer")
        .closest(".ph-no-capture"),
    ).not.toBeNull();
    unmount();

    render(
      <InAppAgentQuestionnaireSummary
        answers={[
          {
            question: "private-question",
            answer: ["private-other-answer"],
            skipped: false,
          },
        ]}
      />,
    );
    for (const text of ["private-question", "private-other-answer"]) {
      expect(screen.getByText(text).closest(".ph-no-capture")).not.toBeNull();
    }
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
