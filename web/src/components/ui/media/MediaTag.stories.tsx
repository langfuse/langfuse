import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { MediaTag } from "./MediaTag";

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
  title: "components/media/MediaTag",
  component: MediaTag,
  args: {
    contentType: "image/png",
    onOpenChange: fn(),
  },
});

// Collapsed chip; hover/focus to open the peek. Loads "ready" content so the
// popover shows the image when opened.
export const Default = meta.story({
  args: {
    status: "ready",
    url: sampleImage,
  },
});

// Peek popover forced open with a resolved image.
export const PreviewImage = meta.story({
  args: {
    open: true,
    status: "ready",
    url: sampleImage,
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
