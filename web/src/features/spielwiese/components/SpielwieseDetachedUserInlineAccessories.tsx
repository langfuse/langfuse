import Image from "next/image";
import { CircleQuestionMark, Paperclip, Table2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import {
  spielwieseStripItemClassName,
  spielwieseStripItemFieldClassName,
} from "./SpielwieseHeaderStrip";
import { getSpielwieseAssetPath } from "../spielwieseAssetPath";

const detachedUserAccessoryButtonClassName =
  "text-foreground/62 hover:text-foreground flex h-full min-w-0 items-center bg-transparent px-0 py-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0";
const detachedUserAccessoryTagClassName =
  "border-r border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)] text-foreground/58 flex h-full w-6 shrink-0 items-center justify-center";
const detachedUserDatasetTooltipCopy =
  "Run the same prompt against a batch of user messages at once so you can compare outputs and tune the prompt faster.";
const detachedUserDatasetDocsHref =
  "https://langfuse.com/docs/evaluation/experiments/overview";
const detachedUserDatasetTooltipClassName =
  "text-foreground/72 pointer-events-none invisible absolute top-full left-0 z-20 mt-2 w-[15rem] translate-y-1 rounded-[12px] bg-[rgba(255,255,255,0.98)] px-3 py-2 text-left text-[0.6875rem] leading-[1.05rem] font-normal opacity-0 shadow-[0_16px_40px_rgba(15,23,42,0.12),0_4px_14px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-focus-within/dataset-tooltip:pointer-events-auto group-focus-within/dataset-tooltip:visible group-focus-within/dataset-tooltip:translate-y-0 group-focus-within/dataset-tooltip:opacity-100 group-hover/dataset-tooltip:pointer-events-auto group-hover/dataset-tooltip:visible group-hover/dataset-tooltip:translate-y-0 group-hover/dataset-tooltip:opacity-100";

function DetachedUserUploadFileTag() {
  return (
    <>
      <dt className="sr-only">Upload file</dt>
      <dd className={spielwieseStripItemClassName}>
        <button
          aria-label="Upload file"
          className={cn(
            detachedUserAccessoryButtonClassName,
            "overflow-visible",
          )}
          data-testid="spielwiese-detached-user-upload-tag"
          type="button"
        >
          <span className={detachedUserAccessoryTagClassName}>
            <span
              aria-hidden="true"
              className="relative size-5 shrink-0 overflow-hidden rounded-[6px] shadow-[0_1px_2px_rgba(0,0,0,0.22)] after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.98)]"
              data-testid="spielwiese-detached-user-upload-thumb"
            >
              <Image
                alt=""
                className="h-full w-full object-cover"
                height={20}
                src={getSpielwieseAssetPath(
                  "/spielwiese/upload-file-thumb.webp",
                )}
                unoptimized
                width={20}
              />
            </span>
          </span>
          <span
            className={cn(
              spielwieseStripItemFieldClassName,
              "flex min-w-0 items-center gap-1.25 pr-1.5",
            )}
            data-testid="spielwiese-detached-user-upload-tag-content"
          >
            <Paperclip
              aria-hidden="true"
              className="text-foreground/32 size-3 shrink-0 stroke-[2.2px]"
              data-testid="spielwiese-detached-user-upload-suffix-icon"
            />
            <span className="text-[0.6875rem] font-medium whitespace-nowrap">
              Upload file
            </span>
          </span>
        </button>
      </dd>
    </>
  );
}

function DetachedUserUploadDatasetTag() {
  return (
    <button
      aria-label="Upload dataset"
      className={cn(detachedUserAccessoryButtonClassName, "pr-7")}
      data-testid="spielwiese-detached-user-upload-dataset-tag"
      type="button"
    >
      <span className={detachedUserAccessoryTagClassName}>
        <Table2
          aria-hidden="true"
          className="text-foreground/32 size-3 shrink-0 stroke-[2.2px]"
          data-testid="spielwiese-detached-user-upload-dataset-icon"
        />
      </span>
      <span
        className={cn(
          spielwieseStripItemFieldClassName,
          "text-[0.6875rem] font-medium whitespace-nowrap",
        )}
      >
        Upload dataset
      </span>
    </button>
  );
}

function DetachedUserDatasetAccessory() {
  return (
    <>
      <dt className="sr-only">Upload dataset</dt>
      <dd
        className={cn(
          spielwieseStripItemClassName,
          "relative overflow-visible",
        )}
        data-testid="spielwiese-detached-user-upload-dataset-accessory"
      >
        <DetachedUserUploadDatasetTag />
        <div
          className="text-foreground/46 group/dataset-tooltip absolute top-1/2 right-1.5 z-10 inline-flex size-3.5 -translate-y-1/2 items-center justify-center outline-none after:absolute after:top-full after:left-0 after:h-2 after:w-[15rem] after:content-['']"
          data-testid="spielwiese-detached-user-upload-dataset-info-affordance"
          tabIndex={0}
        >
          <CircleQuestionMark
            aria-hidden="true"
            className="size-3 shrink-0 stroke-[2.2px]"
            data-testid="spielwiese-detached-user-upload-dataset-info-icon"
          />
          <div
            className={detachedUserDatasetTooltipClassName}
            data-testid="spielwiese-detached-user-upload-dataset-tooltip"
            role="tooltip"
          >
            <p>
              {detachedUserDatasetTooltipCopy}{" "}
              <a
                className="text-foreground inline font-medium underline underline-offset-2"
                href={detachedUserDatasetDocsHref}
                rel="noreferrer"
                target="_blank"
              >
                Docs
              </a>
            </p>
          </div>
        </div>
      </dd>
    </>
  );
}

export function SpielwieseDetachedUserInlineAccessories() {
  return (
    <dl
      className="flex min-w-0 shrink-0 items-center gap-1"
      data-testid="spielwiese-detached-user-inline-accessories"
    >
      <DetachedUserUploadFileTag />
      <DetachedUserDatasetAccessory />
    </dl>
  );
}
