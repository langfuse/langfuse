import { cn } from "@/src/utils/tailwind";

type ReceiptRow = {
  label: string;
  amount: string;
  kind: "team" | "person";
  highlight?: boolean;
};

const fullRows: ReceiptRow[] = [
  { label: "ENGINEERING", amount: "$48,215.40", kind: "team", highlight: true },
  { label: "@maya · claude code", amount: "$21,402.10", kind: "person" },
  { label: "@priya · claude code", amount: "$13,852.45", kind: "person" },
  { label: "SUPPORT", amount: "$6,904.22", kind: "team" },
  { label: "support-bot · haiku", amount: "$6,904.22", kind: "person" },
];

/** Illustrative spend receipt for the AI Gateway launch surfaces. */
export function GatewayReceipt({ variant }: { variant: "banner" | "dialog" }) {
  const rows = fullRows;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-background text-foreground font-mono shadow-lg select-none",
        "text-2xs -rotate-2 px-4 pt-4 pb-5",
      )}
    >
      {variant !== "banner" && (
        <div className="text-muted-foreground border-border mb-2 flex justify-between border-b border-dashed pb-2 tracking-widest">
          <span>AI GATEWAY</span>
          {variant === "dialog" && <span>OCT 2026</span>}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              "flex justify-between gap-3",
              row.kind === "team"
                ? "font-bold tracking-wide"
                : "text-muted-foreground pl-3",
              row.kind === "team" && row !== rows[0] && "mt-2",
              row.highlight && "bg-light-blue -mx-1 px-1",
            )}
          >
            <span className="whitespace-nowrap">{row.label}</span>
            <span>{row.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
