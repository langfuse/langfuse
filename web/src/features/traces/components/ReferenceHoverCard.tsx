/**
 * Hover cards for the Session and User references in the trace summary strip.
 *
 * The strip shows the references as quiet links; this answers "is it worth
 * opening?" without the click: how big the session is, how heavy the user is.
 * Same grammar as the observation hover card (bold label, muted rows). The raw
 * id sits in the header with copy and filter shortcuts, since the strip itself
 * shows only the label.
 *
 * Numbers are the ones the Sessions and Users tables show, fetched on first
 * open and cached. User totals are capped to the last 30 days so a bot user
 * with years of traffic does not turn a hover into a full-table scan.
 */

import { type ReactNode, useState } from "react";
import { useRouter } from "next/router";
import { Copy, Filter } from "lucide-react";
import { format } from "date-fns";
import { type FilterState } from "@langfuse/shared";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { api } from "@/src/utils/api";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { buildEventsTablePathForColumnFilter } from "@/src/features/events/lib/eventsTablePaths";
import { attributeColumnFilter } from "@/src/features/traces/components/ObservationAttributesList";

export const USER_WINDOW_DAYS = 30;

type Row = { label: string; value: string };

const CARD_CLASS = "w-64 p-2.5 text-xs";

function formatTime(date: Date | null | undefined): string {
  return date ? format(date, "MMM d HH:mm") : "";
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
      {rows.map((row) => (
        <div key={row.label} className="col-span-full grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="truncate text-right tabular-nums" title={row.value}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      onClick={onClick}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </button>
  );
}

/** Copy the id, or add it to the traces table filter (window covering this trace). */
function ReferenceActions({
  value,
  filterKey,
  projectId,
  anchorTime,
}: {
  value: string;
  filterKey: "session_id" | "user_id";
  projectId: string;
  anchorTime: Date | null | undefined;
}) {
  const router = useRouter();
  const filter = attributeColumnFilter(filterKey, value, "traces");
  const go = (clause: FilterState[number]) =>
    router.push(
      buildEventsTablePathForColumnFilter({
        currentPath: router.asPath,
        projectId,
        target: "traces",
        filter: clause,
        coverTime: anchorTime ?? undefined,
      }),
    );
  return (
    <div className="border-border/60 -mx-1 flex items-center gap-0.5 border-t pt-1.5">
      <ActionButton
        icon={Copy}
        label="Copy"
        onClick={() => copyTextToClipboard(value)}
      />
      {filter ? (
        <ActionButton
          icon={Filter}
          label="Add to filter"
          onClick={() => go(filter.include)}
        />
      ) : null}
    </div>
  );
}

function CardFrame({
  label,
  id,
  note,
  status,
  rows,
  actions,
}: {
  label: string;
  id: string;
  note?: string;
  status: "loading" | "error" | "ready";
  rows: Row[];
  actions: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-bold">{label}</span>
        <span className="text-muted-foreground min-w-0 truncate" title={id}>
          {id}
        </span>
      </div>
      {status === "loading" ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : status === "error" ? (
        <div className="text-muted-foreground">Could not load details.</div>
      ) : (
        <Rows rows={rows} />
      )}
      {note ? <div className="text-muted-foreground">{note}</div> : null}
      {actions}
    </div>
  );
}

export function SessionHoverCard({
  sessionId,
  projectId,
  anchorTime,
  children,
}: {
  sessionId: string;
  projectId: string;
  anchorTime: Date | null | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { isV4 } = useReadPath();
  const v4 = api.sessions.byIdWithScoresFromEvents.useQuery(
    { projectId, sessionId },
    { enabled: open && isV4, staleTime: 60_000 },
  );
  const v3 = api.sessions.byIdWithScores.useQuery(
    { projectId, sessionId },
    { enabled: open && !isV4, staleTime: 60_000 },
  );
  const query = isV4 ? v4 : v3;

  const rows: Row[] = [];
  if (query.data) {
    const count = isV4
      ? (v4.data?.countTraces ?? 0)
      : (v3.data?.traces.length ?? 0);
    const times = isV4
      ? [v4.data?.minTimestamp, v4.data?.maxTimestamp]
      : (() => {
          const ts = (v3.data?.traces ?? []).map((t) => t.timestamp.getTime());
          return ts.length
            ? [new Date(Math.min(...ts)), new Date(Math.max(...ts))]
            : [undefined, undefined];
        })();
    rows.push({ label: "Traces", value: numberFormatter(count, 0) });
    // Always shown: a one-trace session reads as 0s, which is the fact.
    if (times[0] && times[1]) {
      rows.push({
        label: "Duration",
        value: formatIntervalSeconds(
          (times[1].getTime() - times[0].getTime()) / 1000,
        ),
      });
    }
    rows.push({ label: "Cost", value: usdFormatter(query.data.totalCost) });
    const users = query.data.users ?? [];
    if (users.length > 1) {
      rows.push({ label: "Users", value: numberFormatter(users.length, 0) });
    }
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" className={CARD_CLASS}>
        <CardFrame
          label="Session"
          id={sessionId}
          status={query.isError ? "error" : query.data ? "ready" : "loading"}
          rows={rows}
          actions={
            <ReferenceActions
              value={sessionId}
              filterKey="session_id"
              projectId={projectId}
              anchorTime={anchorTime}
            />
          }
        />
      </HoverCardContent>
    </HoverCard>
  );
}

export function UserHoverCard({
  userId,
  projectId,
  anchorTime,
  children,
}: {
  userId: string;
  projectId: string;
  anchorTime: Date | null | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { isV4 } = useReadPath();
  // Fixed at first open so the query key does not change every render.
  const [fromTimestamp] = useState(
    () => new Date(Date.now() - USER_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  );
  const v4 = api.users.byIdFromEvents.useQuery(
    { projectId, userId, fromTimestamp },
    { enabled: open && isV4, staleTime: 60_000 },
  );
  const v3 = api.users.byId.useQuery(
    { projectId, userId },
    { enabled: open && !isV4, staleTime: 60_000 },
  );
  const query = isV4 ? v4 : v3;

  const rows: Row[] = [];
  if (query.data) {
    rows.push({
      label: "Traces",
      value: numberFormatter(Number(query.data.totalTraces), 0),
    });
    if (query.data.firstTrace) {
      rows.push({
        label: "First seen",
        value: formatTime(query.data.firstTrace),
      });
    }
    if (query.data.lastTrace) {
      rows.push({
        label: "Last seen",
        value: formatTime(query.data.lastTrace),
      });
    }
    rows.push({
      label: "Cost",
      value: usdFormatter(Number(query.data.sumCalculatedTotalCost)),
    });
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" className={CARD_CLASS}>
        <CardFrame
          label="User"
          id={userId}
          note={isV4 ? `Last ${USER_WINDOW_DAYS} days` : "All time"}
          status={query.isError ? "error" : query.data ? "ready" : "loading"}
          rows={rows}
          actions={
            <ReferenceActions
              value={userId}
              filterKey="user_id"
              projectId={projectId}
              anchorTime={anchorTime}
            />
          }
        />
      </HoverCardContent>
    </HoverCard>
  );
}
