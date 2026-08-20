import React from "react";
import preview from "../../../../.storybook/preview";
import { StatusBadge, type Status } from "./StatusBadge";

const meta = preview.meta({
  component: StatusBadge,
});

const representativeStatuses = [
  "active",
  "pending",
  "delayed",
  "disabled",
  "paused",
  "completed",
  "error",
  "partial",
] satisfies Status[];

const allSizes = ["default", "lg"] as const;

export const Default = meta.story({
  args: {
    type: "active",
  },
});

export const NotLive = meta.story({
  args: {
    type: "active",
    isLive: false,
  },
});

export const PreservedCase = meta.story({
  args: {
    type: "my-custom-label",
    preserveCase: true,
    isLive: false,
  },
});

export const UnknownStatus = meta.story({
  args: {
    type: "somethingelse",
  },
});

export const DotOnly = meta.story({
  args: {
    type: "active",
    showText: false,
    variant: "transparent",
  },
});

export const LargeWithCustomContent = meta.story({
  args: {
    type: "waiting",
    showText: false,
    size: "lg",
    children: "Waiting for events",
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(2, max-content)" }}
    >
      {representativeStatuses.map((status) =>
        allSizes.map((size) => (
          <div key={`${status}-${size}`} className="flex items-center gap-3">
            <StatusBadge type={status} size={size} />
            <div className="text-sm">
              {status} / {size}
            </div>
          </div>
        )),
      )}
    </div>
  ),
});
