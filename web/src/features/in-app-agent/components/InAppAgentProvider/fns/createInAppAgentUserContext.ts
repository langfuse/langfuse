import { type AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";

type InAppAgentContext = AgUiRunAgentInput["context"];

export function createInAppAgentUserContext(params: {
  userName?: string | null;
  timezone?: string | null;
  languages: string[];
}): InAppAgentContext {
  const context: InAppAgentContext = [];
  const userName = params.userName?.trim();
  const timezone = params.timezone?.trim();
  const languages = params.languages
    .map((language) => language.trim())
    .filter(Boolean);

  if (userName) {
    context.push({
      description: "user_name",
      value: userName,
    });
  }

  if (timezone) {
    context.push({
      description: "current_timezone",
      value: timezone,
    });
  }

  if (languages.length > 0) {
    context.push({
      description: "browser_languages",
      value: languages.join(", "),
    });
  }

  return context;
}
