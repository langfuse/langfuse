import preview from "../../../.storybook/preview";
import { expect, spyOn, within } from "storybook/test";
import { type ComponentProps, type ReactNode, useState } from "react";
import { FoldVertical, UnfoldVertical } from "@langfuse/icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact, getQueryKey } from "@trpc/react-query";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { type AppRouter } from "@/src/server/api/root";
import { api } from "@/src/utils/api";
import { MediaContentType } from "@/src/features/media";
import { MediaEnabledFields } from "@/src/features/media/validation";
import { MarkdownRenderCharacterLimitContext } from "@/src/components/MarkdownRenderCharacterLimitProvider/MarkdownRenderCharacterLimitContext";
import { JsonViewController } from "./JsonViewController";
import { IOSection } from "./IOSection";
import { PrettyJsonView } from "./PrettyJsonView";
import { PrettyJsonViewContent } from "./PrettyJsonViewContent";
import { LARGE_STRING_RENDER_CHAR_LIMIT } from "./largeStringGate";

function SectionPreview(props: ComponentProps<typeof PrettyJsonView>) {
  const { title = "Input" } = props;
  return (
    <JsonViewController {...props}>
      {(state) => (
        <IOSection
          title={title}
          onCopy={state.copy}
          actions={
            state.contentKind === "table" && state.hasExpandableRows
              ? [
                  {
                    icon: state.allRowsExpanded ? FoldVertical : UnfoldVertical,
                    label: state.allRowsExpanded
                      ? "Collapse all rows"
                      : "Expand all rows",
                    onClick: state.toggleAllRows,
                  },
                ]
              : undefined
          }
          variant={state.contentKind === "table" ? "table" : "text"}
        >
          <PrettyJsonViewContent state={state} title={title} borderless />
        </IOSection>
      )}
    </JsonViewController>
  );
}

const meta = preview.meta({
  component: PrettyJsonView,
  render: (args) => <SectionPreview {...args} />,
  decorators: [
    (Story) => (
      <MarkdownRenderCharacterLimitContext.Provider value={5_000}>
        <Story />
      </MarkdownRenderCharacterLimitContext.Provider>
    ),
  ],
  args: { json: { channels: ["email", "paid_social"] } },
});

export const StandaloneExpansion = meta.story({
  name: "(Test) Owns expansion without a section",
  render: (args) => <PrettyJsonView {...args} />,
  play: async ({ canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    await expect(table.queryByText("email")).not.toBeInTheDocument();
    await userEvent.click(
      table.getByRole("button", { name: "Expand channels" }),
    );
    await expect(await table.findByText("email")).toBeVisible();
  },
});

export const SectionControls = meta.story({
  name: "(Test) Section controls copying and row expansion",
  play: async ({ args, canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    const expand = canvas.getByRole("button", { name: "Expand all rows" });
    expand.focus();
    await userEvent.click(expand);
    await expect(await table.findByText("email")).toBeVisible();
    await userEvent.click(
      await canvas.findByRole("button", { name: "Collapse all rows" }),
    );
    await expect(table.queryByText("email")).not.toBeInTheDocument();
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      const copy = canvas.getByRole("button", { name: "Copy to clipboard" });
      copy.focus();
      await userEvent.click(copy);
      await expect(writeText).toHaveBeenCalled();
      await expect(JSON.parse(writeText.mock.calls[0]![0])).toEqual(args.json);
    } finally {
      writeText.mockRestore();
    }
  },
});

export const ExpandedPrimitiveList = meta.story({
  name: "(Test) Primitive lists can be expanded and collapsed",
  play: async ({ canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    await expect(table.queryByText("email")).not.toBeInTheDocument();
    await userEvent.click(
      table.getByRole("button", { name: "Expand channels" }),
    );
    for (const text of ["email", "paid_social"]) {
      await expect(table.getByText(text)).toBeVisible();
    }
    await userEvent.click(
      table.getByRole("button", { name: "Collapse channels" }),
    );
    await expect(table.queryByText("email")).not.toBeInTheDocument();
    await expect(table.getByText(/email.*paid_social/)).toBeVisible();
  },
});

export const HiddenChildren = meta.story({
  name: "(Test) Keeps the parent preview when all children are hidden",
  args: { json: { flags: [null, 0, ""] }, showNullValues: false },
  play: async ({ canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    await userEvent.click(table.getByRole("button", { name: "Expand flags" }));
    await expect(table.getByText('[null, 0, ""]')).toBeVisible();
    await expect(table.queryByText("null")).not.toBeInTheDocument();
  },
});

export const ExpandedObjectPreview = meta.story({
  name: "(Test) Nested objects can be expanded and collapsed",
  args: { json: { users: [{ name: "Ada" }] } },
  play: async ({ canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    await expect(table.queryByText("Ada")).not.toBeInTheDocument();
    await userEvent.click(table.getByRole("button", { name: "Expand 0" }));
    await expect(table.getByText("name")).toBeVisible();
    await expect(table.getByText("Ada")).toBeVisible();
    await userEvent.click(table.getByRole("button", { name: "Collapse 0" }));
    await expect(table.queryByText("Ada")).not.toBeInTheDocument();
    await expect(table.getByText(/Ada/)).toBeVisible();
  },
});

export const LargeString = meta.story({
  name: "(Test) Large strings show a bounded fallback and download control",
  args: { json: "x".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1) },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText(/Large string —/i)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Download full value/i }),
    ).toBeVisible();
    await expect(canvasElement.textContent?.length ?? 0).toBeLessThan(10_000);
  },
});

export const ParsingLargePayload = meta.story({
  name: "(Test) Parsing takes precedence over the large-string fallback",
  args: {
    json: JSON.stringify({ x: "y".repeat(LARGE_STRING_RENDER_CHAR_LIMIT) }),
    parsedJson: undefined,
    isParsing: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Large string —/i)).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /Download full value/i }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText(/Parsing in background/i)).toBeVisible();
  },
});

export const SettledLargeString = meta.story({
  name: "(Test) Settled large strings use the fallback",
  args: {
    json: "ignored-raw",
    parsedJson: "z".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Large string —/i)).toBeVisible();
  },
});

const attachment = {
  mediaId: "media-id",
  contentType: MediaContentType.TXT,
  contentLength: 1,
  url: "https://example.com/media.txt",
  urlExpiry: "2099-01-01T00:00:00.000Z",
  field: MediaEnabledFields.Output,
};
const storyApi = createTRPCReact<AppRouter>();

function MediaProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      getQueryKey(
        api.media.getById,
        { mediaId: attachment.mediaId, projectId: "storybook-project" },
        "query",
      ),
      attachment,
    );
    return client;
  });
  const [client] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        () => () =>
          observable((observer) => {
            observer.error(
              new TRPCClientError<AppRouter>(
                "Unexpected API request in PrettyJsonView media story",
              ),
            );
          }),
      ],
    }),
  );
  return (
    <storyApi.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </storyApi.Provider>
  );
}

export const LargeStringWithAttachment = meta.story({
  name: "(Test) Large-string fallback retains attachments",
  decorators: [
    (Story) => (
      <MediaProviders>
        <Story />
      </MediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: {
    json: "x".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1),
    title: "Output",
    media: [attachment],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Large string —/i)).toBeVisible();
    const file = await canvas.findByRole("button", { name: /media\.txt/ });
    await expect(file).toBeVisible();
  },
});
