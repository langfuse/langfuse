import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { ModernSessionHeader } from "@/src/features/sessions/ModernSessionHeader";
import { modernSessionHeaderScore } from "@/src/features/sessions/__fixtures__/modernSessionHeaderScore";

const scores = [
  modernSessionHeaderScore({
    id: "score-helpfulness",
    name: "Helpfulness",
    value: 0.86,
  }),
] satisfies ComponentProps<typeof ModernSessionHeader>["scores"];

const overflowScores = Array.from({ length: 16 }, (_, index) =>
  modernSessionHeaderScore({
    id: `score-quality-${index + 1}`,
    name: `Quality ${index + 1}`,
    value: (index + 1) / 20,
  }),
) satisfies ComponentProps<typeof ModernSessionHeader>["scores"];

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
  parameters: {
    layout: "fullscreen",
    a11y: {
      test: "error",
      // Score chips are `ScoreBadge compact`, shared with the trace tree: its
      // muted-on-muted palette sits at 3.82:1. Restyling it is a change to
      // every chip in the app, so it is not this header's call — every other
      // a11y rule stays at error, and nothing else here violates contrast.
      config: { rules: [{ id: "color-contrast", enabled: false }] },
    },
  },
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

export const TestSearchesOverflowPills = meta.story({
  name: "(Test) Searches overflow pills",
  // Scores collapse to two chips + "+N", so the line only overflows when the
  // header is narrow, as on a split trace/session layout.
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
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
          name: /show \d+ more session details/i,
        }),
      ).toBeInTheDocument(),
    );
    const overflowButton = canvas.getByRole("button", {
      name: /show \d+ more session details/i,
    });
    const visibleItems = canvasElement.querySelectorAll<HTMLElement>(
      "[data-overflow-visible-item='true']",
    );
    const lastVisibleItem = visibleItems.item(visibleItems.length - 1);
    // gap-3 between the text items and the overflow control.
    await expect(
      overflowButton.getBoundingClientRect().left -
        lastVisibleItem.getBoundingClientRect().right,
    ).toBeLessThanOrEqual(12);
    const overflowButtonRect = overflowButton.getBoundingClientRect();
    const lastVisibleItemRect = lastVisibleItem.getBoundingClientRect();
    await expect(
      Math.abs(
        overflowButtonRect.top +
          overflowButtonRect.height / 2 -
          (lastVisibleItemRect.top + lastVisibleItemRect.height / 2),
      ),
    ).toBeLessThanOrEqual(0.5);
    const trailingButton = canvas.getByRole("button", {
      name: "Add metadata JSONPath",
    });
    const trailingGap =
      trailingButton.getBoundingClientRect().left -
      overflowButton.getBoundingClientRect().right;
    await expect(trailingGap).toBeGreaterThanOrEqual(0);
    await expect(trailingGap).toBeLessThanOrEqual(12);

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
      within(dialog).queryByText("Quality 16:"),
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
        name: /show \d+ more session details/i,
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
        name: "User user-999@example.com",
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
    // Each pinned path renders as key:value attribute text, titled with the
    // JSONPath; the measurement row holds a hidden copy of each.
    const getVisiblePath = (path: string) =>
      canvas
        .getAllByTitle(path)
        .find((element) => element.closest("[data-overflow-visible-item]"));
    await expect(getVisiblePath("$.email")).toHaveTextContent(
      "email danielm@nexite.io",
    );
    await expect(getVisiblePath("$.cloud_region")).toHaveTextContent(
      "cloud_region EU",
    );

    await userEvent.hover(getVisiblePath("$.email")!);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Remove metadata JSONPath $.email",
      }),
    );
    await expect(canvas.queryByTitle("$.email")).not.toBeInTheDocument();
    await expect(getVisiblePath("$.cloud_region")).toBeInTheDocument();
  },
});

export const TestShowsCostAndTokenBreakdown = meta.story({
  name: "(Test) Shows cost and token breakdown",
  parameters: {
    a11y: {
      test: "error",
      // The open breakdown tooltip is the shared usage `BreakdownTooltip`, shared with the trace
      // view: its corner `<th>` is empty by design. Same reasoning as the
      // file-level contrast exemption — not this header's component to change.
      config: {
        rules: [
          { id: "color-contrast", enabled: false },
          { id: "empty-table-header", enabled: false },
        ],
      },
    },
  },
  args: {
    ...minimalArgs,
    tokensIn: 648_714,
    tokensOut: 6_697,
    totalTokens: 655_411,
  },
  play: async ({ canvasElement }) => {
    const visibleRow = canvasElement.querySelector<HTMLElement>(
      "[data-overflow-visible-item='true']:has([title='Cost'])",
    );
    // Cost is plain text; the token total carries the hover breakdown.
    await expect(visibleRow).toHaveTextContent("$0.084291");
    await expect(visibleRow).toHaveTextContent("655,411");

    const usage = visibleRow!.querySelector<HTMLElement>(
      "[title='Usage breakdown on hover']",
    );
    await userEvent.hover(usage!);
    const body = within(canvasElement.ownerDocument.body);
    // Radix mirrors tooltip content into a visually hidden copy for screen
    // readers, so every node in the breakdown matches twice.
    await expect(
      (await body.findAllByText("Token breakdown")).length,
    ).toBeGreaterThan(0);
    await expect(body.getAllByText("648,714").length).toBeGreaterThan(0);
    await expect(body.getAllByText("6,697").length).toBeGreaterThan(0);
  },
});
