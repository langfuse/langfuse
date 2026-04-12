"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseModelOption } from "./spielwieseModelCatalog";
import { getBenchmarkTableRows } from "./spielwieseModelPickerBenchmarkData";
import type {
  SpielwieseBenchmarkMetricTone,
  SpielwieseBenchmarkRowValue,
  SpielwieseBenchmarkTableRow,
} from "./spielwieseModelPickerBenchmarkHelpers";

function getBenchmarkLabelTestId(label: string) {
  return `spielwiese-model-picker-benchmark-label-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function BenchmarkLabelTrigger({
  description,
  href,
  label,
}: {
  description: string;
  href?: string;
  label: string;
}) {
  return (
    <Tooltip disableHoverablePopup={false}>
      <TooltipTrigger
        aria-label={`${label} benchmark details`}
        className="text-foreground/74 hover:text-foreground inline-flex h-4 shrink-0 items-center border-b border-black/12 text-[10px] leading-4 font-medium transition-colors outline-none"
        data-testid={getBenchmarkLabelTestId(label)}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent
        className="pointer-events-auto max-w-[15rem] rounded-[10px] border-black/10 bg-[#FBFBF8] px-2.5 py-2 text-[10px] leading-4 shadow-[0_14px_30px_rgba(15,23,42,0.12)]"
        side="top"
      >
        <p>{description}</p>
        {href ? (
          <a
            className="mt-1 inline-flex text-[11px] font-medium text-[#245B45] underline-offset-2 hover:underline"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            Artificial Analysis
          </a>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function getValueToneClass(tone: SpielwieseBenchmarkMetricTone) {
  switch (tone) {
    case "good":
      return "border-emerald-700/12 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-700/12 bg-amber-50 text-amber-700";
    case "danger":
      return "border-rose-700/12 bg-rose-50 text-rose-700";
    default:
      return "border-black/8 bg-black/[0.04] text-foreground/54";
  }
}

function BenchmarkValueBadge({
  children,
  tone,
}: {
  children: string;
  tone: SpielwieseBenchmarkMetricTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded-[6px] border px-1.5 py-0 text-[10px] leading-4 font-semibold tabular-nums",
        getValueToneClass(tone),
      )}
    >
      {children}
    </span>
  );
}

function BenchmarkRow({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <tr className="border-t border-black/6 first:border-t-0">
      <th className="px-1.5 py-1 text-left align-top font-medium">
        <div className="text-foreground/76 flex min-w-0 items-center gap-1.5 text-[10px] leading-4 font-medium">
          {label}
        </div>
      </th>
      <td className="px-1.5 py-1 text-right align-top">{value}</td>
    </tr>
  );
}

function renderRowValue(value: SpielwieseBenchmarkRowValue) {
  return (
    <BenchmarkValueBadge tone={value.tone}>{value.text}</BenchmarkValueBadge>
  );
}

function renderRowLabel(row: SpielwieseBenchmarkTableRow) {
  if (!row.info) {
    return row.label;
  }

  return (
    <BenchmarkLabelTrigger
      description={row.info.description}
      href={row.info.href}
      label={row.info.label}
    />
  );
}

export function SpielwieseBenchmarkTable({
  model,
}: {
  model: SpielwieseModelOption;
}) {
  const rows = getBenchmarkTableRows(model);

  return (
    <TooltipProvider delayDuration={120}>
      <table className="w-full border-collapse text-[10px] leading-4">
        <tbody>
          {rows.map((row) => (
            <BenchmarkRow
              key={row.label}
              label={renderRowLabel(row)}
              value={renderRowValue(row.value)}
            />
          ))}
        </tbody>
      </table>
    </TooltipProvider>
  );
}
