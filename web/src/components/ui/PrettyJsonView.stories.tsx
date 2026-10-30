import preview from "../../../.storybook/preview";
import { expect, fn, spyOn, within, waitFor } from "storybook/test";
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
  args: {
    externalExpansionState: false,
    onExternalExpansionChange: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    await expect(
      canvas.queryByRole("button", { name: "Copy to clipboard" }),
    ).not.toBeInTheDocument();
    await expect(table.queryByText("email")).not.toBeInTheDocument();
    await userEvent.click(
      table.getByRole("button", { name: "Expand channels" }),
    );
    await expect(await table.findByText("email")).toBeVisible();
    await expect(args.onExternalExpansionChange).toHaveBeenCalled();
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
      await expect(writeText).toHaveBeenCalledWith(
        JSON.stringify(args.json, null, 4),
      );
    } finally {
      writeText.mockRestore();
    }
  },
});

export const CollapsedPrimitiveList = meta.story({
  name: "(Test) Short primitive lists show only the parent preview",
  args: { json: { brand: "Acme", channels: ["email", "paid_social"] } },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table"));
    await expect(table.getByText("channels")).toBeVisible();
    await expect(table.getByText('["email", "paid_social"]')).toBeVisible();
    await expect(table.queryByText("0")).not.toBeInTheDocument();
    await expect(table.queryByText("1")).not.toBeInTheDocument();
  },
});

export const ExpandedPrimitiveList = meta.story({
  name: "(Test) Expanding a primitive list hides its parent preview",
  play: async ({ canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    await userEvent.click(
      table.getByRole("button", { name: "Expand channels" }),
    );
    await expect(
      table.queryByText('["email", "paid_social"]'),
    ).not.toBeInTheDocument();
    for (const text of ["0", "1", "email", "paid_social"]) {
      await expect(table.getByText(text)).toBeVisible();
    }
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

export const QuotedListPreview = meta.story({
  name: "(Test) Escapes quotes in list previews",
  args: { json: { quoted: ['a"b'] } },
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("table")).getByText('["a\\"b"]'),
    ).toBeVisible();
  },
});

export const ObjectListPreview = meta.story({
  name: "(Test) Object lists expand with collapsed object previews",
  args: { json: { users: [{ name: "Ada" }] } },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table"));
    await expect(table.getByText("0")).toBeVisible();
    await expect(table.getByText('{"name": "Ada"}')).toBeVisible();
    await expect(table.queryByText("1 items")).not.toBeInTheDocument();
    await expect(table.queryByText("name")).not.toBeInTheDocument();
  },
});

export const ExpandedObjectPreview = meta.story({
  name: "(Test) Expanding an object hides its preview",
  args: { json: { users: [{ name: "Ada" }] } },
  play: async ({ canvas, userEvent }) => {
    const table = within(canvas.getByRole("table"));
    await userEvent.click(table.getByRole("button", { name: "Expand 0" }));
    await expect(table.queryByText('{"name": "Ada"}')).not.toBeInTheDocument();
    await expect(table.getByText("name")).toBeVisible();
    await expect(table.getByText("Ada")).toBeVisible();
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

export const SmallContent = meta.story({
  name: "(Test) Small content renders normally",
  args: { json: { foo: "bar", n: 1 } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Large string —/i)).not.toBeInTheDocument();
    const table = within(canvas.getByRole("table"));
    await expect(table.getByText("bar")).toBeVisible();
    await expect(table.getByText("1")).toBeVisible();
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

export const HeaderlessLargeString = meta.story({
  name: "(Test) Large-string fallback works without a section",
  render: (args) => <PrettyJsonView {...args} />,
  args: {
    json: "x".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1),
    title: "system",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Large string —/i)).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Collapse system/i }),
    ).not.toBeInTheDocument();
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

export const AttachmentAlignment = meta.story({
  name: "(Test) Attachment tiles align with their section label",
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
    await waitFor(async () => {
      const labelRange = document.createRange();
      labelRange.selectNodeContents(canvas.getByText("Media"));
      const labelLeft = labelRange.getBoundingClientRect().left;
      const tileLeft = file.getBoundingClientRect().left;
      await expect(Math.abs(tileLeft - labelLeft)).toBeLessThan(1);
    });
  },
});
