import type { AgUiRunAgentInput } from "@/src/ee/features/in-app-agent/schema";

type InAppAgentContext = AgUiRunAgentInput["context"];

export function createInAppAgentScreenContext(params: {
  currentUrl: string;
}): InAppAgentContext {
  return [
    {
      description: "current_url",
      value: params.currentUrl,
    },
  ];
}

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
