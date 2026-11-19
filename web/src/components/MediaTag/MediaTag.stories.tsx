import { expect, fireEvent, fn, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { MediaTag } from "./MediaTag";
import { SafeImageController } from "@/src/components/design-system/SafeImageController/SafeImageController";

// Inline SVG so the "ready" image preview renders without any network.
const sampleImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#34d399"/>
           <stop offset="1" stop-color="#0ea5e9"/>
         </linearGradient>
       </defs>
       <rect width="320" height="200" fill="url(#g)"/>
       <text x="160" y="108" font-family="sans-serif" font-size="22"
             fill="white" text-anchor="middle">sample image</text>
     </svg>`,
  );

const meta = preview.meta({
  component: MediaTag,
  render: (args) => {
    if (
      !args.url ||
      !args.contentType.startsWith("image/") ||
      args.imageState
    ) {
      return <MediaTag {...args} />;
    }
    return (
      <SafeImageController src={args.url}>
        {(imageState) => <MediaTag {...args} imageState={imageState} />}
      </SafeImageController>
    );
  },
  args: {
    contentType: "image/png",
    onOpenChange: fn(),
  },
});

// Collapsed chip; hover/focus to open the peek. Loads "ready" content so the
// popover shows the image when opened.
export const Default = meta.story({
  name: "(Test) Open on click",
  args: {
    status: "ready",
    url: sampleImage,
  },
  play: async ({ canvas, args, userEvent, canvasElement }) => {
    const chip = canvas.getByRole("button", { name: "PNG media" });
    await expect(chip.querySelector("span")).toHaveAttribute(
      "title",
      "image/png",
    );
    await userEvent.click(chip);
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("image/png")).toBeVisible();
    await expect(args.onOpenChange).toHaveBeenCalledWith(true);
    await expect(chip.querySelector("span")).toHaveAttribute("title", "");
  },
});

// Peek popover forced open with a resolved image.
export const PreviewImage = meta.story({
  name: "(Test) Image load failure",
  args: {
    contentType: "image/jpeg",
    open: true,
    status: "ready",
    url: sampleImage,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const image = canvasElement.ownerDocument.body.querySelector("img");
    await expect(image).toBeInTheDocument();
    if (!image) throw new globalThis.Error("Missing media preview");
    await fireEvent.error(image);
    await expect(await body.findByText("Failed to load media")).toBeVisible();
  },
});

// A very high-resolution image must stay bounded by the popover's caps
// (max-height + the card's max-width), not render at intrinsic size.
const largeImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000">
       <rect width="4000" height="3000" fill="#0ea5e9"/>
       <text x="2000" y="1550" font-family="sans-serif" font-size="320"
             fill="white" text-anchor="middle">4000 x 3000</text>
     </svg>`,
  );

export const PreviewLargeImage = meta.story({
  args: {
    open: true,
    status: "ready",
    url: largeImage,
  },
});

// Wikimedia file pages can look like direct images by URL extension, but they
// serve HTML. The preview should fall back once the image element errors.
export const WikimediaFilePageFallback = meta.story({
  args: {
    contentType: "image/jpeg",
    open: true,
    status: "ready",
    url: "https://commons.wikimedia.org/wiki/File:Gull_portrait_ca_usa.jpg",
    imageState: {
      status: "error",
      src: "https://commons.wikimedia.org/wiki/File:Gull_portrait_ca_usa.jpg",
      message: "Cannot load image",
    },
  },
});

// Peek popover while the URL is still resolving (hover-triggered fetch).
export const Loading = meta.story({
  args: {
    open: true,
    status: "loading",
  },
});

// Resolved media that failed to load.
export const Error = meta.story({
  args: {
    open: true,
    status: "error",
  },
});

// Audio resolves to an inline player rather than a thumbnail.
export const PreviewAudio = meta.story({
  args: {
    contentType: "audio/mpeg",
    open: true,
    status: "ready",
    url: "data:audio/mpeg;base64,",
  },
});

// Non-previewable type: chip + open-in-new-tab only, no inline preview.
export const PreviewFile = meta.story({
  args: {
    contentType: "application/pdf",
    open: true,
    status: "ready",
    url: "data:application/pdf;base64,",
  },
});

// Oversized observation fields are preserved as attachments rather than
// looking like discarded data.
export const OversizedField = meta.story({
  name: "(Test) Oversized field attachment",
  args: {
    contentType: "text/plain",
    label: "Full value attached",
    description:
      "This field was too large to process inline, so Langfuse saved the complete original value as an attachment at ingestion.",
    openActionLabel: "Open original",
    intent: "attachment",
    open: true,
    status: "ready",
    url: "data:text/plain,original%20oversized%20field",
    contentLength: 2.5 * 1024 * 1024,
  },
  play: async ({ canvas, canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("button", { name: "Full value attached media" }),
    ).toBeVisible();
    await expect(body.getByText(args.description!)).toBeVisible();
    const link = body.getByRole("link", { name: "Open original" });
    await expect(link).toHaveAttribute("href", args.url);
  },
});

export const TruncatedMimeType = meta.story({
  name: "(Test) Generated MIME label",
  args: {
    contentType:
      "application/vnd.example.intentionally-verbose-archive-format-for-truncation",
  },
  play: async ({ canvas, args }) => {
    const label = canvas.getByRole("button").querySelector("span");
    await expect(label).toHaveAttribute("title", args.contentType);
  },
});

export const TruncatedMimeTypePreview = meta.story({
  args: {
    contentType:
      "application/vnd.example.intentionally-verbose-archive-format-for-truncation",
    open: true,
    status: "error",
  },
});

export const InlineWithText = meta.story({
  render: () => (
    <pre className="font-sans text-sm">
      {'"media": "'}
      <span className="inline-flex">
        <MediaTag contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </span>
      {'"}]}'}
    </pre>
  ),
});

export const FormattedView = meta.story({
  render: () => (
    <div className="grid w-full font-mono text-xs/5">
      <MediaTag contentType="image/png" />
    </div>
  ),
});

export const CompactJsonRow = meta.story({
  render: () => (
    <span className="flex items-start font-mono text-[0.7rem] leading-[14px]">
      <span>media: </span>
      <MediaTag contentType="image/png" size="sm" />
    </span>
  ),
});

export const OfficeFormats = meta.story({
  name: "(Test) Office format labels",
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <MediaTag contentType="application/msword" />
      <MediaTag contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      <MediaTag contentType="application/vnd.ms-excel" />
      <MediaTag contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
    </div>
  ),
  play: async ({ canvas }) => {
    for (const label of ["DOC", "DOCX", "XLS", "XLSX"]) {
      await expect(
        canvas.getByRole("button", { name: `${label} media` }),
      ).toBeVisible();
    }
  },
});

export const WithoutImageState = meta.story({
  name: "(Test) URL without image state",
  args: {
    status: "ready",
    url: "https://example.com/private.png",
    open: true,
  },
  render: (args) => <MediaTag {...args} />,
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.ownerDocument.body.querySelector("img"),
    ).not.toBeInTheDocument();
  },
});

export const PrivatePreview = meta.story({
  name: "(Test) Private preview and isolated actions",
  args: {
    description: "customer-provided media description",
    status: "ready",
    url: sampleImage,
    open: true,
  },
  render: (args) => (
    <div onClick={() => args.onOpenChange?.(true)}>
      <MediaTag {...args} />
    </div>
  ),
  play: async ({ canvasElement, args, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Session-recording exclusion depends on PostHog's class contract.
    // eslint-disable-next-line @repo/storybook-play-no-implementation-detail-assertions
    await expect(body.getByText(args.description!).parentElement).toHaveClass(
      "ph-no-capture",
    );
    const link = body.getByRole("link", { name: "Open in new tab" });
    // Exercise propagation without opening a new browser tab.
    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    await userEvent.click(link);
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
});

export const TouchOpensPreview = meta.story({
  name: "(Test) Touch opens preview",
  args: {
    status: "ready",
    url: sampleImage,
  },
  play: async ({ canvas, canvasElement, args }) => {
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerType: "touch",
    });
    await fireEvent(canvas.getByRole("button", { name: "PNG media" }), event);
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("image/png")).toBeVisible();
    await expect(event.defaultPrevented).toBe(true);
    await expect(args.onOpenChange).toHaveBeenCalledWith(true);
    await expect(args.onOpenChange).toHaveBeenCalledTimes(1);
  },
});

// Design showcase: one chip per media kind, collapsed.
export const AllKinds = meta.story({
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <MediaTag contentType="image/jpeg" />
      <MediaTag contentType="audio/mpeg" />
      <MediaTag contentType="video/mp4" />
      <MediaTag contentType="application/pdf" />
      <MediaTag contentType="image/svg+xml" />
    </div>
  ),
});
