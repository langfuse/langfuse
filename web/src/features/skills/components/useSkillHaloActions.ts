import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";

const CONFIRM_BEFORE_SAVING =
  "Show me the result before you save, and save a new version only after I confirm.";

const CREATE_SKILL_PROMPT = [
  "Help me create a new skill in this project.",
  "Start by asking me what the skill should do and for one or two real tasks it must handle, then guide me through the rest one question at a time.",
  CONFIRM_BEFORE_SAVING,
].join(" ");

function getImproveSkillPrompt(skillName: string, version: number) {
  return [
    `Review the "${skillName}" skill in this project at version ${version}.`,
    "Read every file of that version, list its highest-impact problems, and propose the smallest fixes.",
    CONFIRM_BEFORE_SAVING,
  ].join(" ");
}

/** Opens Halo in a new conversation with a starter prompt for skill work. */
export function useSkillHaloActions() {
  const { openAssistant, submit, isRunning } = useInAppAiAgent();

  const start = async (prompt: string) => {
    if (!openAssistant("skill_editor")) return false;
    return submit(prompt, {
      newConversation: true,
      entryPoint: "skill-editor",
    });
  };

  return {
    isRunning,
    createSkill: () => start(CREATE_SKILL_PROMPT),
    improveSkill: (skillName: string, version: number) =>
      start(getImproveSkillPrompt(skillName, version)),
  };
}
