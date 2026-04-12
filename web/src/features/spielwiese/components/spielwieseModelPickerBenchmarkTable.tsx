"use client";

import type { ReactNode } from "react";
import { Check, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseModelOption } from "./spielwieseModelCatalog";
import {
  getBenchmarkTableRows,
  type SpielwieseBenchmarkMetricTone,
  type SpielwieseBenchmarkRowValue,
} from "./spielwieseModelPickerBenchmarkData";

function BenchmarkInfoTag({
  description,
  href,
  label,
}: {
  description: string;
  href?: string;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${label} benchmark info`}
        className="text-foreground/54 hover:text-foreground/78 inline-flex h-4 shrink-0 items-center gap-1 rounded-full border border-black/8 bg-white/70 px-1.5 text-[10px] font-medium tracking-[0.08em] uppercase transition-colors outline-none"
      >
        <Info className="size-2.75" />
        <span>Info</span>
      </TooltipTrigger>
      <TooltipContent
        className="max-w-[18rem] rounded-[10px] border-black/10 bg-[#FBFBF8] px-2.5 py-2 text-[11px] leading-4 shadow-[0_14px_30px_rgba(15,23,42,0.12)]"
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
            View methodology
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
        "inline-flex min-w-[3.5rem] items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] leading-4 font-semibold tabular-nums",
        getValueToneClass(tone),
      )}
    >
      {children}
    </span>
  );
}

function OwnershipTag({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-4 font-medium",
        active
          ? "border-emerald-700/12 bg-emerald-50 text-emerald-700"
          : "text-foreground/40 border-black/8 bg-black/[0.03] line-through",
      )}
    >
      {active ? <Check className="size-2.75" /> : null}
      <span>{label}</span>
    </span>
  );
}

function BenchmarkRow({
  label,
  note,
  value,
}: {
  label: ReactNode;
  note?: string;
  value: ReactNode;
}) {
  return (
    <tr className="border-t border-black/6 first:border-t-0">
      <th className="px-2 py-1.5 text-left align-top font-medium">
        <div className="text-foreground/76 flex min-w-0 items-start gap-1.5 text-[11px] leading-4 font-medium">
          {label}
        </div>
        {note ? (
          <p className="text-foreground/46 mt-0.5 pr-2 text-[10px] leading-3.5 font-normal">
            {note}
          </p>
        ) : null}
      </th>
      <td className="px-2 py-1.5 text-right align-top">{value}</td>
    </tr>
  );
}

function renderRowValue(value: SpielwieseBenchmarkRowValue) {
  if (value.kind === "badges") {
    return (
      <div className="flex justify-end gap-1.5">
        {value.values.map((item) => (
          <OwnershipTag
            active={item.active}
            key={item.label}
            label={item.label}
          />
        ))}
      </div>
    );
  }

  return (
    <BenchmarkValueBadge tone={value.tone}>{value.text}</BenchmarkValueBadge>
  );
}

function renderRowLabel(row: BenchmarkTableRow) {
  if (!row.info) {
    return row.label;
  }

  return (
    <>
      {row.label}
      <BenchmarkInfoTag
        description={row.info.description}
        href={row.info.href}
        label={row.info.label}
      />
    </>
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
      <div className="rounded-[12px] border border-black/6 bg-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)]">
        <table className="w-full border-collapse text-[11px] leading-4">
          <tbody>
            {rows.map((row) => (
              <BenchmarkRow
                key={row.label}
                label={renderRowLabel(row)}
                note={row.note}
                value={renderRowValue(row.value)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
