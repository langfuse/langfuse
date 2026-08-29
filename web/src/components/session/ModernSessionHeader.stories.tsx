import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { ModernSessionHeader } from "@/src/components/session/ModernSessionHeader";
import { sessionHeaderVisibilityStorageKey } from "@/src/components/session/sessionHeaderVisibility";

const scores = [
  {
    id: "score-helpfulness",
    name: "Helpfulness",
    value: 0.86,
    stringValue: null,
    dataType: "NUMERIC",
  },
] satisfies ComponentProps<typeof ModernSessionHeader>["scores"];

const overflowScores = Array.from({ length: 16 }, (_, index) => ({
  id: `score-quality-${index + 1}`,
  name: `Quality ${index + 1}`,
  value: (index + 1) / 20,
  stringValue: null,
  dataType: "NUMERIC" as const,
})) satisfies ComponentProps<typeof ModernSessionHeader>["scores"];

const manyUsers = Array.from(
  { length: 1_000 },
  (_, index) => `user-${index + 1}@example.com`,
);

const defaultArgs = {
  projectId: "project-1",
  countTraces: 24,
  traces: {
    state: "loaded",
    data: [
      { latencyMs: 1_240, observationCount: 42 },
      { latencyMs: 2_310, observationCount: 38 },
      { latencyMs: 4_620, observationCount: 51 },
      { latencyMs: 8_760, observationCount: 55 },
    ],
  },
  tokensIn: 18_420,
  tokensOut: 6_310,
  totalTokens: 24_730,
  totalCost: 0.084291,
  environment: "production",
  users: ["customer@example.com", "support@example.com"],
  metadataJsonPaths: {
    paths: [],
    source: { state: "idle" },
    onEditorOpenChange: fn(),
    onSave: fn(),
    onRemove: fn(),
  },
  scores,
} satisfies ComponentProps<typeof ModernSessionHeader>;

const minimalArgs = {
  ...defaultArgs,
  traces: { state: "loading" },
  tokensIn: 0,
  tokensOut: 0,
  totalTokens: 0,
  environment: null,
  users: [],
  scores: [],
} satisfies ComponentProps<typeof ModernSessionHeader>;

const meta = preview.meta({
  component: ModernSessionHeader,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const Default = meta.story({ args: defaultArgs });

export const Minimal = meta.story({
  args: minimalArgs,
});

export const Overflow = meta.story({
  args: {
    ...defaultArgs,
    scores: overflowScores,
  },
});

export const ConfiguredMetadata = meta.story({
  args: {
    ...minimalArgs,
    metadataJsonPaths: {
      ...defaultArgs.metadataJsonPaths,
      paths: ["$.langfuse_user_email", "$.cloud_region"],
      source: {
        state: "ready",
        metadata: {
          langfuse_user_email: "danielm@nexite.io",
          cloud_region: "EU",
        },
        metadataTruncated: false,
      },
    },
  },
});

export const TestSearchesHiddenPills = meta.story({
  name: "(Test) Searches hidden pills",
  args: {
    ...defaultArgs,
    scores: overflowScores,
    metadataJsonPaths: {
      ...defaultArgs.metadataJsonPaths,
      paths: ["$.cloud_region"],
      source: {
        state: "ready",
        metadata: { cloud_region: "EU" },
        metadataTruncated: false,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole("button", {
          name: /show \d+ hidden session details/i,
        }),
      ).toBeInTheDocument(),
    );
    const overflowButton = canvas.getByRole("button", {
      name: /show \d+ hidden session details/i,
    });
    const visiblePills = canvasElement.querySelectorAll<HTMLElement>(
      "[data-overflow-visible-item='true'] [data-session-header-pill='true']",
    );
    const lastVisiblePill = visiblePills.item(visiblePills.length - 1);
    await expect(
      overflowButton.getBoundingClientRect().left -
        lastVisiblePill.getBoundingClientRect().right,
    ).toBeLessThanOrEqual(8);
    const overflowButtonRect = overflowButton.getBoundingClientRect();
    const lastVisiblePillRect = lastVisiblePill.getBoundingClientRect();
    await expect(
      Math.abs(
        overflowButtonRect.top +
          overflowButtonRect.height / 2 -
          (lastVisiblePillRect.top + lastVisiblePillRect.height / 2),
      ),
    ).toBeLessThanOrEqual(0.5);
    const trailingButton = canvas.getByRole("button", {
      name: "Add metadata JSONPath",
    });
    const trailingGap =
      trailingButton.getBoundingClientRect().left -
      overflowButton.getBoundingClientRect().right;
    await expect(trailingGap).toBeGreaterThanOrEqual(0);
    await expect(trailingGap).toBeLessThanOrEqual(8);

    await userEvent.click(overflowButton);

    const body = within(canvasElement.ownerDocument.body);
    const searchInput = await body.findByRole("textbox", {
      name: "Search session details",
    });
    const dialog = body.getByRole("dialog");
    await expect(within(dialog).queryByText(/traces/i)).not.toBeInTheDocument();

    await userEvent.type(searchInput, "cloud_region");
    await expect(within(dialog).getByText("cloud_region")).toBeInTheDocument();
    await expect(
      within(dialog).queryByText("Quality 16"),
    ).not.toBeInTheDocument();
  },
});

export const TestBoundsManyUsers = meta.story({
  name: "(Test) Bounds many users",
  args: {
    ...defaultArgs,
    users: manyUsers,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll('a[href*="/users/"]').length,
      ).toBeLessThanOrEqual(6),
    );

    await userEvent.click(
      canvas.getByRole("button", {
        name: /show \d+ hidden session details/i,
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const detailsDialog = body.getByRole("dialog", {
      name: "All session details",
    });
    const results = within(detailsDialog).getByRole("region", {
      name: "Session detail results",
    });
    const initialUserCount = within(results).getAllByRole("link").length;
    await expect(initialUserCount).toBeLessThanOrEqual(53);

    results.scrollTop = results.scrollHeight;
    results.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFor(() =>
      expect(within(results).getAllByRole("link").length).toBeGreaterThan(
        initialUserCount,
      ),
    );

    const searchInput = within(detailsDialog).getByRole("textbox", {
      name: "Search session details",
    });
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "user-999@example.com");
    await expect(
      within(results).getByRole("link", {
        name: "user user-999@example.com",
      }),
    ).toBeInTheDocument();
  },
});

export const TestConfiguresMultipleMetadataPaths = meta.story({
  name: "(Test) Configures multiple metadata paths",
  args: {
    ...minimalArgs,
    metadataJsonPaths: {
      ...defaultArgs.metadataJsonPaths,
      source: {
        state: "ready",
        metadata: {
          email: "danielm@nexite.io",
          cloud_region: "EU",
        },
        metadataTruncated: false,
      },
    },
  },
  render: function Render(args) {
    const [paths, setPaths] = useState<readonly string[]>([]);
    return (
      <ModernSessionHeader
        {...args}
        metadataJsonPaths={{
          ...args.metadataJsonPaths,
          paths,
          onSave: (path) => setPaths((current) => [...current, path]),
          onRemove: (path) =>
            setPaths((current) => current.filter((item) => item !== path)),
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const openEditor = () =>
      userEvent.click(
        canvas.getByRole("button", { name: "Add metadata JSONPath" }),
      );

    await openEditor();
    let input = body.getByLabelText("Metadata JSONPath");
    let save = body.getByRole("button", { name: "Save" });
    await expect(
      body.getByText("Enter a JSONPath to preview metadata."),
    ).toBeInTheDocument();
    await expect(
      body.queryByText("JSONPath must start with $."),
    ).not.toBeInTheDocument();
    await userEvent.type(input, "$.email");
    await userEvent.click(save);

    await openEditor();
    input = body.getByLabelText("Metadata JSONPath");
    save = body.getByRole("button", { name: "Save" });
    await userEvent.type(input, "$.email");
    await expect(
      body.getByText("This JSONPath is already shown."),
    ).toBeInTheDocument();
    await expect(save).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, "$.cloud_region");
    await userEvent.click(save);
    const getVisibleText = (text: string) =>
      canvas
        .getAllByText(text)
        .find((element) => element.closest("[data-overflow-visible-item]"));
    await expect(getVisibleText("email")).toBeInTheDocument();
    await expect(getVisibleText("cloud_region")).toBeInTheDocument();
    await expect(getVisibleText("EU")).toBeInTheDocument();

    const email = getVisibleText("email")!;
    await userEvent.hover(email);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Remove metadata JSONPath $.email",
      }),
    );
    await expect(canvas.queryByText("email")).not.toBeInTheDocument();
    await expect(getVisibleText("cloud_region")).toBeInTheDocument();
  },
});

export const TestCompactsTokenCounts = meta.story({
  name: "(Test) Compacts token counts",
  args: {
    ...minimalArgs,
    tokensIn: 648_714,
    tokensOut: 6_697,
    totalTokens: 655_411,
  },
  play: async ({ canvasElement }) => {
    const tokenPill = Array.from(
      canvasElement.querySelectorAll<HTMLElement>(
        "[data-overflow-visible-item='true'] [data-session-header-pill='true']",
      ),
    ).find((pill) => pill.textContent?.trim().startsWith("tokens "));

    await expect(tokenPill).toBeInTheDocument();
    await expect(tokenPill).toHaveTextContent("tokens 649k → 7k (Σ 655k)");
    await expect(tokenPill).toHaveAttribute(
      "title",
      "tokens 648,714 → 6,697 (Σ 655,411)",
    );
  },
});

export const TestHidesAndRevealsDetails = meta.story({
  name: "(Test) Hides and reveals details",
  args: {
    ...defaultArgs,
    projectId: "project-header-visibility-story",
  },
  play: async ({ canvasElement }) => {
    const storageKey = sessionHeaderVisibilityStorageKey(
      "project-header-visibility-story",
    );
    const storedValue = JSON.stringify([]);
    localStorage.setItem(storageKey, storedValue);
    window.dispatchEvent(
      new CustomEvent("localStorageChange", {
        detail: { key: storageKey, newValue: storedValue },
      }),
    );

    const canvas = within(canvasElement);
    const hideTraceDetail = await canvas.findByRole("button", {
      name: "Hide trace and span counts in session header",
    });
    const visibleTraceDetail = hideTraceDetail.closest(
      "[data-overflow-visible-item='true']",
    );
    await expect(visibleTraceDetail).toBeInTheDocument();
    hideTraceDetail.focus();
    await waitFor(() => expect(hideTraceDetail).toBeVisible());
    await expect(
      hideTraceDetail.getBoundingClientRect().width,
    ).toBeGreaterThanOrEqual(24);
    await expect(
      hideTraceDetail.getBoundingClientRect().height,
    ).toBeGreaterThanOrEqual(24);
    await userEvent.click(hideTraceDetail);
    await expect(
      canvas.queryByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    ).not.toBeInTheDocument();
    await expect(
      JSON.parse(localStorage.getItem(storageKey) ?? "[]"),
    ).toContain("traces");

    const overflowButton = canvas.getByRole("button", {
      name: /show \d+ hidden session details/i,
    });
    await waitFor(() => expect(overflowButton).toHaveFocus());
    await userEvent.click(overflowButton);
    const body = within(canvasElement.ownerDocument.body);
    const overflowSearchInput = await body.findByRole("textbox", {
      name: "Search session details",
    });
    const showTraceDetail = await body.findByRole("button", {
      name: "Show trace and span counts in session header",
    });
    showTraceDetail.focus();
    await waitFor(() => expect(showTraceDetail).toBeVisible());
    await userEvent.click(showTraceDetail);

    await expect(
      canvas.getByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    ).toBeInTheDocument();
    await expect(localStorage.getItem(storageKey)).toBe(JSON.stringify([]));
    const metadataEditorButton = canvas.getByRole("button", {
      name: "Add metadata JSONPath",
    });
    await waitFor(() =>
      expect([overflowSearchInput, metadataEditorButton]).toContain(
        canvasElement.ownerDocument.activeElement,
      ),
    );
  },
});
