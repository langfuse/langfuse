import { useState } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import icon from "@/public/icon.svg";
import huggingFaceLogo from "@/public/assets/huggingface-logo.svg";
import { SafeImage } from "./SafeImage";
import { cn } from "@/src/utils/tailwind";
import { SafeImageController } from "../SafeImageController/SafeImageController";

async function openImageDetails(frame: HTMLElement) {
  const canvas = within(frame);
  const trigger = canvas.queryByRole("button", {
    name: /^(Load image details|Image error details)$/,
  });
  if (trigger) {
    await userEvent.click(trigger);
    return within(
      await within(frame.ownerDocument.body).findByRole("dialog", {
        name: trigger.getAttribute("aria-label") ?? "",
      }),
    );
  }
  return canvas;
}

const meta = preview.meta({
  component: SafeImage,
  args: {
    src: icon,
    alt: "Langfuse",
    className: "bg-muted rounded border",
    width: 64,
    height: 64,
  },
  decorators: [
    (Story, context) => (
      <div className="flex flex-wrap items-start gap-6">
        {(context.name.startsWith("(Test)")
          ? [{ width: context.args.width, height: context.args.height }]
          : [
              { width: 32, height: 32 },
              { width: 64, height: 64 },
              { width: 160, height: 120 },
              { width: 240, height: 160 },
            ]
        ).map(({ width, height }) => (
          <div
            key={width}
            role="group"
            aria-label={`${width} × ${height}`}
            className="flex flex-col gap-2"
          >
            <span className="text-muted-foreground text-xs">
              {width} × {height}
            </span>
            <Story args={{ ...context.args, width, height }} />
          </div>
        ))}
      </div>
    ),
  ],
});

export const ApplicationAsset = meta.story({
  name: "Ready",
  args: {
    loading: "lazy",
    title: "Brand",
  },
});

export const Loading = meta.story({
  args: {
    src: undefined,
    state: { status: "loading" },
  },
});

export const LoadingTest = Loading.extend({
  name: "(Test) Loading",
  play: async ({ canvas }) => {
    const frame = canvas.getByRole("group");
    const loading = within(frame).getByRole("status", {
      name: "Loading image",
    });
    await expect(loading).toBeVisible();
    const bounds = loading.getBoundingClientRect();
    const text = within(loading).getByText("Loading image...");
    if (bounds.width >= 144 && bounds.height >= 64) {
      await expect(text).toBeVisible();
    } else {
      await expect(text).not.toBeVisible();
    }
  },
});

export const LoadingWithTextTest = LoadingTest.extend({
  name: "(Test) Loading with text",
  args: { width: 240, height: 160 },
});

export const TallImagePreview = meta.story({
  name: "(Test) Tall image preview",
  args: { width: 240, height: 160 },
  render: ({ width, height, className }) => (
    <SafeImageController
      src={`data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="1000"><rect width="100" height="1000" fill="blue"/></svg>',
      )}`}
    >
      {(state) => (
        <SafeImage
          state={state}
          width={width}
          height={height}
          alt="Tall preview"
          className={cn(className, "max-h-64 max-w-full object-contain")}
        />
      )}
    </SafeImageController>
  ),
  play: async ({ canvas }) => {
    const frame = canvas.getByRole("group");
    const image = within(frame).getByRole<HTMLImageElement>("img", {
      name: "Tall preview",
    });
    await image.decode();
    const bounds = image.getBoundingClientRect();
    await expect(bounds.height).toBeLessThanOrEqual(160);
    await expect(image).toHaveStyle({ objectFit: "contain" });
  },
});

export const ConsentRequired = meta.story({
  args: {
    src: undefined,
    state: {
      status: "consent",
      src: "https://example.com/preview.png",
      onLoad: fn(),
    },
  },
});

export const ConsentRequiredTest = ConsentRequired.extend({
  name: "(Test) Consent required",
  play: async ({ canvas, args }) => {
    if (args.state?.status !== "consent") {
      throw new Error("Expected consent state");
    }
    const frame = canvas.getByRole("group");
    const detailsTrigger = within(frame).queryByRole("button", {
      name: "Load image details",
    });
    const details = await openImageDetails(frame);
    if (detailsTrigger) {
      await expect(details.getByText("Image hidden")).toBeVisible();
      await expect(
        details.getByText(
          "Loading this image contacts its source server. Load it only if you trust the source.",
        ),
      ).toBeVisible();
      await expect(details.getByText("Image source")).toBeVisible();
    }
    await expect(
      details.getByRole("button", { name: "Load Image" }),
    ).toBeVisible();
    await expect(details.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/preview.png",
    );
    await userEvent.click(details.getByRole("button", { name: "Load Image" }));
    await expect(args.state.onLoad).toHaveBeenCalledOnce();
    await userEvent.keyboard("{Escape}");
  },
});

export const InlineConsentTest = ConsentRequiredTest.extend({
  name: "(Test) Inline consent",
  args: { width: 480, height: 160 },
});

export const Error = meta.story({
  args: {
    src: undefined,
    state: {
      status: "error",
      src: "https://example.com/preview.png",
      message: "Cannot load image",
    },
  },
});

export const ErrorTest = Error.extend({
  name: "(Test) Error",
  play: async ({ canvas }) => {
    const frame = canvas.getByRole("group");
    const detailsTrigger = within(frame).queryByRole("button", {
      name: "Image error details",
    });
    const details = await openImageDetails(frame);
    if (detailsTrigger) {
      await expect(details.getByText("Image unavailable")).toBeVisible();
      await expect(
        details.getByText(/blocked for security reasons/),
      ).toBeVisible();
    }
    await expect(details.getByText("Cannot load image")).toBeVisible();
    await expect(
      details.getByText("https://example.com/preview.png"),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
  },
});

export const InlineErrorTest = ErrorTest.extend({
  name: "(Test) Inline error",
  args: { width: 480, height: 160 },
});

export const SourceOverflow = meta.story({
  name: "(Test) Source overflow responds to resizing",
  args: {
    src: undefined,
    width: 240,
    height: 160,
    state: {
      status: "consent",
      src: "https://example.com/images/observation-preview.png",
      onLoad: fn(),
    },
  },
  render: function Render(args) {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
      <>
        <button onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? "Shrink preview" : "Widen preview"}
        </button>
        <SafeImage
          {...args}
          width={isExpanded ? 480 : args.width}
          height={isExpanded ? 160 : args.height}
        />
      </>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const frame = canvas.getByRole("group");
    const preview = within(frame);
    const trigger = await preview.findByRole("button", {
      name: "Load image details",
    });
    await expect(trigger).toBeVisible();
    await userEvent.click(trigger);
    const dialog = await within(frame.ownerDocument.body).findByRole("dialog", {
      name: "Load image details",
    });
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      preview.getByRole("button", { name: "Widen preview" }),
    );
    await expect(
      await preview.findByRole("button", { name: "Load Image" }),
    ).toBeVisible();
    await userEvent.click(
      preview.getByRole("button", { name: "Shrink preview" }),
    );
    await expect(
      await preview.findByRole("button", { name: "Load image details" }),
    ).toBeVisible();
  },
});

export const UnsafeSources = meta.story({
  name: "(Test) Unsafe sources",
  render: ({ width, height, className }) => (
    <>
      {[
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "//attacker.example/image.png",
        "/\\attacker.example/image.png",
      ].map((src) => (
        <section key={src} aria-label={src}>
          <SafeImageController src={src}>
            {(state) => (
              <SafeImage
                state={state}
                alt="Unsafe"
                className={className}
                width={width}
                height={height}
              />
            )}
          </SafeImageController>
        </section>
      ))}
    </>
  ),
  play: async ({ canvas }) => {
    for (const region of canvas.getAllByRole("region")) {
      await expect(within(region).queryByRole("img")).not.toBeInTheDocument();
      const details = await openImageDetails(region);
      await expect(details.getByText("Cannot load image")).toBeVisible();
      await userEvent.keyboard("{Escape}");
    }
  },
});

export const LoadErrorAndRecovery = meta.story({
  name: "(Test) Load error and recovery",
  args: { onError: fn() },
  render: function Render(args) {
    const [src, setSrc] = useState(icon);
    return (
      <>
        <button onClick={() => setSrc(huggingFaceLogo)}>Replace source</button>
        <SafeImage {...args} state={undefined} src={src} />
      </>
    );
  },
  play: async ({ canvasElement, args, userEvent }) => {
    const frame = within(canvasElement).getByRole("group");
    const canvas = within(frame);
    await fireEvent.error(canvas.getByRole("img"));
    await expect(args.onError).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    const details = await openImageDetails(frame);
    await expect(details.getByText("Cannot load image")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Replace source" }),
    );
    await expect(canvas.getByRole("img")).toHaveAttribute(
      "src",
      huggingFaceLogo.src,
    );
  },
});

export const ConsentResetsForReplacementSourceTest = meta.story({
  name: "(Test) Consent resets for replacement source",
  render: function Render(args) {
    const [src, setSrc] = useState("/icon.svg?version=a");
    return (
      <>
        <button onClick={() => setSrc("/icon.svg?version=b")}>
          Replace source
        </button>
        <button onClick={() => setSrc("/icon.svg?version=a")}>
          Restore source
        </button>
        <SafeImageController src={src} isDefaultVisible={false}>
          {(state) => (
            <SafeImage {...args} state={state} alt="Preview" src={undefined} />
          )}
        </SafeImageController>
      </>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    const frame = within(canvasElement).getByRole("group");
    const canvas = within(frame);
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    let details = await openImageDetails(frame);
    await userEvent.click(details.getByRole("button", { name: "Load Image" }));
    await expect(canvas.getByRole("img")).toHaveAttribute(
      "src",
      "/icon.svg?version=a",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Replace source" }),
    );
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    details = await openImageDetails(frame);
    await userEvent.click(details.getByRole("button", { name: "Load Image" }));
    await expect(canvas.getByRole("img")).toHaveAttribute(
      "src",
      "/icon.svg?version=b",
    );
    await fireEvent.error(canvas.getByRole("img"));
    details = await openImageDetails(frame);
    await expect(details.getByText("Cannot load image")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Restore source" }),
    );
    await expect(
      canvas.queryByText("Cannot load image"),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    details = await openImageDetails(frame);
    await userEvent.click(details.getByRole("button", { name: "Load Image" }));
    await expect(canvas.getByRole("img")).toHaveAttribute(
      "src",
      "/icon.svg?version=a",
    );
  },
});
