import type { IconComponent } from "@langfuse/icons";
import {
  SiAmazon,
  SiAnthropic,
  SiClaude,
  SiCplusplus,
  SiDatabricks,
  SiElevenlabs,
  SiGithubcopilot,
  SiGoogle,
  SiGooglecloud,
  SiGooglegemini,
  SiHuggingface,
  SiKong,
  SiLangchain,
  SiMilvus,
  SiOpenai,
  SiOpentelemetry,
  SiPydantic,
  SiPython,
  SiQuarkus,
  SiSlack,
  SiSpring,
  SiTemporal,
  SiTypescript,
  SiVercel,
  SiZapier,
} from "@langfuse/icons/si";
import { integrationOf } from "./catalog";

/** Brand icons by integration slug, for the integrations the icon set has a logo for. */
export const LOGOS: Partial<Record<string, IconComponent>> = {
  "python-sdk": SiPython,
  "js-ts-sdk": SiTypescript,
  opentelemetry: SiOpentelemetry,
  "ai-sdk-cpp": SiCplusplus,
  "amazon-agentcore": SiAmazon,
  "amazon-bedrock-agents": SiAmazon,
  "claude-agent-sdk": SiClaude,
  "claude-agent-sdk-js": SiClaude,
  "claude-platform": SiClaude,
  "claude-code": SiClaude,
  "google-adk": SiGoogle,
  "google-gemini": SiGooglegemini,
  "google-vertex-ai": SiGooglecloud,
  langchain: SiLangchain,
  "langchain-deepagents": SiLangchain,
  langgraph: SiLangchain,
  "openai-agents": SiOpenai,
  "openai-js": SiOpenai,
  "openai-py": SiOpenai,
  codex: SiOpenai,
  anthropic: SiAnthropic,
  "anthropic-js": SiAnthropic,
  "pydantic-ai": SiPydantic,
  "quarkus-langchain4j": SiQuarkus,
  "spring-ai": SiSpring,
  temporal: SiTemporal,
  "vercel-ai-sdk": SiVercel,
  "vercel-ai-gateway": SiVercel,
  databricks: SiDatabricks,
  huggingface: SiHuggingface,
  "kong-ai-plugin": SiKong,
  elevenlabs: SiElevenlabs,
  "github-copilot": SiGithubcopilot,
  milvus: SiMilvus,
  slack: SiSlack,
  zapier: SiZapier,
};

/**
 * What IntegrationLogo draws for an integration: the docs' logo image, with its brand icon (or, without one, its
 * initials) until the image loads or when it can't.
 */
export function logoOf(slug: string) {
  return {
    image: integrationOf(slug)?.logo,
    icon: LOGOS[slug],
  };
}
