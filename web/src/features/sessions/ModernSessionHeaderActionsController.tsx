import { CopyIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  ShareLinkMenuItem,
  ShareLinkPopoverController,
  usePublishSession,
} from "@/src/components/publish-object-switch";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

function buildSessionClickHouseQuery(
  table: "events_full" | "events_core",
  projectId: string,
  sessionId: string,
) {
  const quote = (value: string) =>
    `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

  // Session membership belongs to the trace; child events may have no session_id.
  // Resolve current membership from core before reading every event in the trace.
  return `WITH
  ${quote(projectId)} AS target_project_id,
  ${quote(sessionId)} AS target_session_id
SELECT *
FROM ${table}
WHERE project_id = target_project_id
  AND trace_id IN (
    SELECT trace_id
    FROM events_core
    WHERE project_id = target_project_id
      AND trace_id IN (
        SELECT trace_id
        FROM events_core
        WHERE project_id = target_project_id
          AND session_id = target_session_id
      )
    GROUP BY trace_id
    HAVING argMaxIf(session_id, event_ts, session_id <> '') = target_session_id
  )
ORDER BY start_time ASC, event_ts DESC;`;
}

export function ModernSessionHeaderActionsController({
  projectId,
  sessionId,
  isPublic,
  showCorrections,
  showInlineToolCalls,
  showSystemPrompt,
  onShowCorrectionsChange,
  onShowInlineToolCallsChange,
  onShowSystemPromptChange,
  children,
}: {
  projectId: string;
  sessionId: string;
  isPublic: boolean;
  showCorrections?: boolean;
  showInlineToolCalls?: boolean;
  showSystemPrompt?: boolean;
  onShowCorrectionsChange?: (isEnabled: boolean) => void;
  onShowInlineToolCallsChange?: (isEnabled: boolean) => void;
  onShowSystemPromptChange?: (isEnabled: boolean) => void;
  children: ReactNode;
}) {
  const session = useSession();
  const capture = usePostHogClientCapture();
  const { copy } = useCopyToClipboard();
  const publish = usePublishSession({ projectId, sessionId });
  const hasDisplaySettings =
    (showCorrections !== undefined && onShowCorrectionsChange) ||
    (showInlineToolCalls !== undefined && onShowInlineToolCallsChange) ||
    (showSystemPrompt !== undefined && onShowSystemPromptChange);

  return (
    <DropdownMenu>
      {children}
      <DropdownMenuContent align="end">
        <ShareLinkPopoverController
          itemName="session"
          isPublic={isPublic}
          isLoading={publish.isPending}
          onToggle={publish.toggle}
        >
          {({ Trigger }) => (
            <Trigger asChild>
              <ShareLinkMenuItem
                isPublic={isPublic}
                disabled={!publish.hasAccess || publish.isPending}
              />
            </Trigger>
          )}
        </ShareLinkPopoverController>
        <DropdownMenuItem
          onClick={async () => {
            capture("session_detail:copy_session_id_click");
            await copy(sessionId);
          }}
        >
          <CopyIcon className="mr-2 h-3.5 w-3.5" />
          Copy session ID
        </DropdownMenuItem>
        {session.data?.user?.admin === true &&
          (["events_full", "events_core"] as const).map((table) => (
            <DropdownMenuItem
              key={table}
              onClick={async () => {
                await copy(
                  buildSessionClickHouseQuery(table, projectId, sessionId),
                );
              }}
            >
              <CopyIcon className="mr-2 h-3.5 w-3.5" />
              Copy {table} query
            </DropdownMenuItem>
          ))}
        {hasDisplaySettings ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Display</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {showCorrections !== undefined && onShowCorrectionsChange ? (
                  <DropdownMenuCheckboxItem
                    checked={showCorrections}
                    onClick={(event) => {
                      event.preventDefault();
                      onShowCorrectionsChange(!showCorrections);
                    }}
                  >
                    Show corrections
                  </DropdownMenuCheckboxItem>
                ) : null}
                {showInlineToolCalls !== undefined &&
                onShowInlineToolCallsChange ? (
                  <DropdownMenuCheckboxItem
                    checked={showInlineToolCalls}
                    onClick={(event) => {
                      event.preventDefault();
                      onShowInlineToolCallsChange(!showInlineToolCalls);
                    }}
                  >
                    Show tool calls
                  </DropdownMenuCheckboxItem>
                ) : null}
                {showSystemPrompt !== undefined && onShowSystemPromptChange ? (
                  <DropdownMenuCheckboxItem
                    checked={showSystemPrompt}
                    onClick={(event) => {
                      event.preventDefault();
                      onShowSystemPromptChange(!showSystemPrompt);
                    }}
                  >
                    Show system prompt
                  </DropdownMenuCheckboxItem>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
