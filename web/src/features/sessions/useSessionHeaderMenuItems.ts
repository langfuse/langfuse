import { CheckIcon, CopyIcon } from "@langfuse/icons";
import { useSession } from "next-auth/react";

import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { useShareMenuItems } from "@/src/components/useShareMenuItems";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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

type DisplaySettingProps = {
  showCorrections?: boolean;
  showInlineToolCalls?: boolean;
  showSystemPrompt?: boolean;
  onShowCorrectionsChange?: (isEnabled: boolean) => void;
  onShowInlineToolCallsChange?: (isEnabled: boolean) => void;
  onShowSystemPromptChange?: (isEnabled: boolean) => void;
};

function buildDisplayItems({
  showCorrections,
  showInlineToolCalls,
  showSystemPrompt,
  onShowCorrectionsChange,
  onShowInlineToolCallsChange,
  onShowSystemPromptChange,
}: DisplaySettingProps) {
  const settings = [
    {
      id: "show-corrections",
      title: "Show corrections",
      checked: showCorrections,
      onChange: onShowCorrectionsChange,
    },
    {
      id: "show-tool-calls",
      title: "Show tool calls",
      checked: showInlineToolCalls,
      onChange: onShowInlineToolCallsChange,
    },
    {
      id: "show-system-prompt",
      title: "Show system prompt",
      checked: showSystemPrompt,
      onChange: onShowSystemPromptChange,
    },
  ];

  return settings.flatMap(({ id, title, checked, onChange }) =>
    checked !== undefined && onChange
      ? [
          {
            type: "checkbox" as const,
            id,
            title,
            checked,
            onCheckedChange: onChange,
          },
        ]
      : [],
  );
}

export function useSessionHeaderMenuItems({
  projectId,
  sessionId,
  isPublic,
  ...displaySettings
}: DisplaySettingProps & {
  projectId: string;
  sessionId: string;
  isPublic: boolean;
}) {
  const session = useSession();
  const capture = usePostHogClientCapture();
  const { copy } = useCopyToClipboard();
  const { copy: copySessionId, isCopied } = useCopyToClipboard({
    successDuration: 1500,
  });
  const shareItems = useShareMenuItems({
    kind: "session",
    projectId,
    objectId: sessionId,
    isPublic,
  });
  const displayItems = buildDisplayItems(displaySettings);

  const adminItems: DropdownMenuItemDefinition[] =
    session.data?.user?.admin === true
      ? (["events_full", "events_core"] as const).map((table) => ({
          type: "item" as const,
          id: `copy-${table}-query`,
          title: `Copy ${table} query`,
          icon: CopyIcon,
          onClick: async () => {
            await copy(
              buildSessionClickHouseQuery(table, projectId, sessionId),
            );
          },
        }))
      : [];

  const items: DropdownMenuItemDefinition[] = [
    ...shareItems,
    {
      type: "item",
      id: "copy-session-id",
      title: "Copy session ID",
      icon: isCopied ? CheckIcon : CopyIcon,
      onClick: () => {
        capture("session_detail:copy_session_id_click");
        return copySessionId(sessionId);
      },
    },
    ...adminItems,
    ...(displayItems.length > 0
      ? [
          { id: "display-separator", type: "separator" as const },
          {
            type: "submenu" as const,
            id: "display",
            title: "Display",
            items: displayItems,
          },
        ]
      : []),
  ];

  return items;
}
