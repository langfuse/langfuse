import { CopyIcon, MoreVertical } from "@langfuse/icons";
import { useSession } from "next-auth/react";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";

import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { HeaderActionMenuRows } from "@/src/components/HeaderActionMenuRows";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { useShareMenuItems } from "@/src/components/useShareMenuItems";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { ConnectedDetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
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
  useRootIO?: boolean;
  onShowCorrectionsChange?: (isEnabled: boolean) => void;
  onShowInlineToolCallsChange?: (isEnabled: boolean) => void;
  onShowSystemPromptChange?: (isEnabled: boolean) => void;
  onUseRootIOChange?: (isEnabled: boolean) => void;
};

function buildDisplayItems({
  showCorrections,
  showInlineToolCalls,
  showSystemPrompt,
  useRootIO,
  onShowCorrectionsChange,
  onShowInlineToolCallsChange,
  onShowSystemPromptChange,
  onUseRootIOChange,
}: DisplaySettingProps): DropdownMenuItemDefinition[] {
  const settings = [
    {
      id: "use-root-io",
      title: "Use root input/output",
      checked: useRootIO,
      onChange: onUseRootIOChange,
    },
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

/**
 * Session header kebab: share items, Copy session ID, admin-only ClickHouse
 * query copies and a Display submenu. `layout="menu"` renders the clickable
 * items as full-width rows for the mobile header overflow menu.
 */
export function ModernSessionHeaderActionsController({
  projectId,
  sessionId,
  isPublic,
  layout = "toolbar",
  ...displaySettings
}: DisplaySettingProps & {
  projectId: string;
  sessionId: string;
  isPublic: boolean;
  layout?: "toolbar" | "menu";
}) {
  const session = useSession();
  const capture = usePostHogClientCapture();
  const { copy } = useCopyToClipboard();
  const shareItems = useShareMenuItems({
    kind: "session",
    projectId,
    objectId: sessionId,
    isPublic,
  });
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  const displayItems = buildDisplayItems({
    ...displaySettings,
    useRootIO: internalFeaturesEnabled ? displaySettings.useRootIO : undefined,
  });

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

  return (
    <ConnectedDetailHeaderActionsMenuController
      idItems={[{ id: sessionId, name: "session ID" }]}
      projectId={projectId}
      renderMenu={(copyItems) => {
        const items: DropdownMenuItemDefinition[] = [
          ...shareItems,
          ...copyItems.map((item) =>
            item.type === "item" && item.onClick
              ? {
                  ...item,
                  onClick: () => {
                    capture("session_detail:copy_session_id_click");
                    item.onClick();
                  },
                }
              : item,
          ),
          ...adminItems,
          ...(displayItems.length > 0
            ? [
                { id: "display-separator", type: "separator" as const },
                {
                  type: "submenu" as const,
                  id: "display",
                  title: "Display",
                  internal: displaySettings.useRootIO !== undefined,
                  items: displayItems,
                },
              ]
            : []),
        ];

        if (layout === "menu") {
          return <HeaderActionMenuRows items={items} />;
        }

        return (
          <DropdownMenu items={items} placement="bottom-end">
            {({ getTriggerProps }) => (
              <HeaderActionButton
                label="Session actions"
                icon={<MoreVertical size="base" />}
                {...getTriggerProps()}
              />
            )}
          </DropdownMenu>
        );
      }}
    />
  );
}
