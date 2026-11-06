// @vitest-environment jsdom

import type { CaptureResult, PostHogConfig } from "posthog-js";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  QueryInput,
  useQueryInputController,
} from "@/src/components/design-system/QueryInput/QueryInput";
import { LayerContainerProvider } from "@/src/context/LayerContext/LayerContext";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { ComposerWithPreview } from "@/src/features/search-bar/components/ComposerWithPreview";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer/SearchComposer";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

const { initMock, savedTelemetry } = vi.hoisted(() => ({
  initMock: vi.fn(),
  savedTelemetry: {} as Record<string, unknown>,
}));

vi.mock("posthog-js", () => ({
  default: {
    init: initMock,
    debug: vi.fn(),
    get_property: (key: string) => savedTelemetry[key],
    register: (properties: Record<string, unknown>) =>
      Object.assign(savedTelemetry, properties),
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
    for (const key of Object.keys(savedTelemetry)) delete savedTelemetry[key];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("blocks sensitive select options in their portaled DOM boundary", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <LayerContainerProvider name="popover" container={document.body}>
        <SelectInput
          noCapture
          aria-label="Environment"
          value="private-env"
          options={[{ value: "private-env", label: "Private environment" }]}
          onValueChange={vi.fn()}
          placeholder="All environments"
          search={{ placeholder: "Find an environment" }}
        />
      </LayerContainerProvider>,
    );
    const trigger = screen.getByRole("combobox", { name: "Environment" });
    fireEvent.click(trigger);
    const option = await screen.findByRole("option", {
      name: "Private environment",
    });
    expect(trigger.closest(".ph-no-capture")).not.toBeNull();
    expect(option.closest(".ph-no-capture")).not.toBeNull();
    Element.prototype.scrollIntoView = scrollIntoView;
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

  it("redacts Agents URLs in initial, persisted and replay telemetry", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "EU");
    await import("@/src/pages/_app");
    const config = initMock.mock.calls[0]![1] as Partial<PostHogConfig>;
    const beforeSend = config.before_send;
    if (typeof beforeSend !== "function")
      throw new Error("A telemetry boundary must run before every event");

    const origin = "https://cloud.langfuse.com";
    const privateUrl = `${origin}/base/project/project-1/agents/private-agent?environment=private-env&search=private-search#private-name`;
    const dotIdentityUrl = `${origin}/project/project-1/agents?agentId=..&environment=private-env`;
    savedTelemetry.$initial_person_info = { u: privateUrl, r: privateUrl };
    const posthog = (await import("posthog-js")).default;
    config.loaded!(posthog);
    expect(savedTelemetry.$initial_person_info).toEqual({
      u: `${origin}/base/project/[projectId]/agents/[agentId]`,
      r: `${origin}/base/project/[projectId]/agents/[agentId]`,
    });
    savedTelemetry.$client_session_props = {
      sessionId: "test-session",
      props: { u: dotIdentityUrl, r: privateUrl },
    };
    const event: CaptureResult = {
      uuid: "test-event",
      event: "$pageview",
      properties: {
        $current_url: privateUrl,
        $pathname: "/base/project/project-1/agents/private-agent",
        $referrer: privateUrl,
        $session_entry_url: privateUrl,
        title: "private-agent",
        $set_once: { $initial_current_url: dotIdentityUrl },
        $prev_pageview_pathname: "/project/project-1/agents/private-agent",
        unrelatedUrl: `${origin}/project/project-1/traces?view=table`,
      },
      $set_once: { $initial_referrer: privateUrl },
    };
    const sanitized = beforeSend(event)!;
    expect(sanitized.properties.$current_url).toBe(
      `${origin}/base/project/[projectId]/agents/[agentId]`,
    );
    expect(sanitized.properties.$set_once.$initial_current_url).toBe(
      `${origin}/project/[projectId]/agents/[agentId]`,
    );
    expect(sanitized.properties.unrelatedUrl).toBe(
      event.properties.unrelatedUrl,
    );
    expect(sanitized.event).toBe("$pageview");
    const output = JSON.stringify(sanitized);
    for (const value of [
      "private-agent",
      "private-env",
      "private-search",
      "private-name",
    ])
      expect(output).not.toContain(value);
    expect(JSON.stringify(savedTelemetry)).not.toContain("private-");

    const maskRequest = config.session_recording!.maskCapturedNetworkRequestFn!;
    const maskUrl = (name: string) =>
      maskRequest({ name, duration: 0, entryType: "resource", startTime: 0 });
    expect(maskUrl(privateUrl)?.name).toBe(sanitized.properties.$current_url);
    const requestUrl = `${origin}/api/trpc/agents.detail,environment.all?batch=1&input=${encodeURIComponent(JSON.stringify({ identity: "private-agent", environment: "private-env" }))}`;
    expect(maskUrl(requestUrl)?.name).toBe(
      `${origin}/api/trpc/agents.detail,environment.all`,
    );
    for (const procedure of [
      "events.all",
      "sessions.allFromEvents",
      "scores.getScoreColumns",
    ]) {
      const scopedUrl = `${origin}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: { agentScope: { identity: { kind: "id", value: "private-agent" }, environment: "private-env" } } }))}`;
      expect(maskUrl(scopedUrl)?.name).toBe(`${origin}/api/trpc/${procedure}`);
    }
    const unscopedUrl = `${origin}/api/trpc/events.all?input=${encodeURIComponent(JSON.stringify({ json: { limit: 20 } }))}`;
    expect(maskUrl(unscopedUrl)?.name).toBe(unscopedUrl);
    const capturedRequest = maskRequest({
      name: requestUrl,
      duration: 0,
      entryType: "resource",
      startTime: 0,
      requestHeaders: { referer: privateUrl },
      requestBody: "private-agent",
      responseBody: "private-env",
    });
    expect(capturedRequest?.requestHeaders?.referer).toBe(
      sanitized.properties.$current_url,
    );
    expect(capturedRequest?.requestBody).toBe("REDACTED");
    expect(capturedRequest?.responseBody).toBe("REDACTED");
    expect(maskUrl(`${origin}/api/other?existing=value`)?.name).toBe(
      `${origin}/api/other?existing=value`,
    );
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
