"use client";

import { Check, Copy } from "@langfuse/icons";
import { type ComponentPropsWithoutRef } from "react";
import { type useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { InputControl } from "../internal/InputControl/InputControl";

/** A selectable, read-only value with a clipboard action. */
export function CopyInput({
  value,
  copyLabel,
  noCapture,
  clipboard,
  ...inputProps
}: Pick<
  ComponentPropsWithoutRef<"input">,
  "id" | "aria-describedby" | "aria-label" | "aria-labelledby"
> & {
  value: string;
  copyLabel: string;
  noCapture?: boolean;
  clipboard: Pick<ReturnType<typeof useCopyToClipboard>, "copy" | "copyStatus">;
}) {
  const { copy, copyStatus } = clipboard;
  // Alternate mounted live regions so rapid successes produce fresh announcements.
  const copyAnnouncementRegionIndex =
    copyStatus.kind === "copied"
      ? copyStatus.consecutiveSuccesses % 2
      : undefined;

  return (
    <div>
      <InputControl
        contentLayout="text"
        trailingAction={{
          label: copyLabel,
          icon: copyStatus.kind === "copied" ? Check : Copy,
          onClick: () => {
            copy(value).catch(() => undefined);
          },
        }}
      >
        <input
          {...inputProps}
          className={noCapture ? "ph-no-capture" : undefined}
          data-1p-ignore
          value={value}
          readOnly
        />
      </InputControl>
      {[0, 1].map((index) => (
        <span key={index} role="status" className="sr-only">
          {copyAnnouncementRegionIndex === index && "Copied to clipboard."}
        </span>
      ))}
    </div>
  );
}
