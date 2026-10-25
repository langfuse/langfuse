import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";

/** Markdown for "Copy for agent"; it carries the key placeholder, never the key. */
export function formatAgentSetupMarkdown(instructions: AgentSetupInstructions) {
  const steps = instructions.steps.map((step, index) =>
    [
      `## ${index + 1}. ${step.title}`,
      step.description,
      step.link ? `[${step.link.label}](${step.link.href})` : undefined,
      step.code === undefined
        ? undefined
        : `\`\`\`${step.language}\n${step.code}\n\`\`\``,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  return [
    `# ${instructions.heading}`,
    `${instructions.summary} Ask the user for their Langfuse gateway key and use it in place of \`${GATEWAY_KEY_PLACEHOLDER}\`. Never write the key into a repository or a shared file.`,
    instructions.warning ? `> Note: ${instructions.warning}` : undefined,
    ...steps,
    `Docs: ${instructions.docsUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
}
