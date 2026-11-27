import { Wrench } from "@langfuse/icons";
import {
  IN_APP_AGENT_CREATE_SKILL_FROM_DRAFT_TOOL_NAME,
  IN_APP_AGENT_EDIT_SKILL_DRAFT_TOOL_NAME,
  IN_APP_AGENT_READ_SKILL_DRAFT_TOOL_NAME,
  type InAppAgentBrowserToolName,
} from "@langfuse/shared/in-app-agent";
import { Button } from "@/src/components/design-system/Button/Button";
import { type PendingBrowserToolCall } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { cn } from "@/src/utils/tailwind";

const TITLES: Record<InAppAgentBrowserToolName, string> = {
  [IN_APP_AGENT_EDIT_SKILL_DRAFT_TOOL_NAME]:
    "Halo wants to change your skill draft",
  [IN_APP_AGENT_READ_SKILL_DRAFT_TOOL_NAME]:
    "Halo wants to read your skill draft",
  [IN_APP_AGENT_CREATE_SKILL_FROM_DRAFT_TOOL_NAME]:
    "Create a skill version from your draft?",
};

/** Asks the user to run or decline a browser tool Halo is waiting on. */
export function InAppAgentBrowserToolCard({
  call,
  isCompact,
}: {
  call: PendingBrowserToolCall;
  isCompact: boolean;
}) {
  const isCreate =
    call.toolName === IN_APP_AGENT_CREATE_SKILL_FROM_DRAFT_TOOL_NAME;
  const title = TITLES[call.toolName];
  const description = call.isThisTab
    ? "Halo saves the draft from this tab, including your edits."
    : "Another tab started this. It holds its own draft, so run it there, or here to use this tab's draft.";

  return (
    <div
      className={cn(
        "bg-card text-foreground border-border rounded-2xl border shadow-xs",
        isCompact
          ? "rounded-xl px-2.5 py-2 text-[0.775rem]"
          : "px-3 py-2.5 text-sm",
      )}
    >
      <div className="flex items-center gap-2 text-xs leading-none font-bold">
        <Wrench size="base" color="muted" />
        <span className="min-w-0 flex-1 truncate py-0.5" title={title}>
          {title}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">{description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          text={isCreate ? "Create version" : "Run in this tab"}
          loading={call.isRunning}
          onClick={call.run}
        />
        <Button
          size="sm"
          variant="outline"
          text="Decline"
          disabled={call.isRunning}
          onClick={call.decline}
        />
      </div>
    </div>
  );
}
