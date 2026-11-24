import type { PrismaClient } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

import type { GatewayResolveGuardrails } from "@/src/features/ai-gateway/server/provider/registry";
import { GatewayGuardrailRepository } from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailRepository";
import {
  GatewayRegexGuardrailConfigSchema,
  presetPatterns,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

export class GatewayGuardrailService {
  private readonly repository: GatewayGuardrailRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new GatewayGuardrailRepository(prisma);
  }

  /** The guardrails the gateway checks for a key, in the resolve response's shape. */
  async resolveForKey(params: {
    organizationId: string;
    apiKeyId: string;
    userId: string | null;
  }): Promise<GatewayResolveGuardrails> {
    const guardrails = await this.repository.findAssigned(params);
    return guardrails.flatMap((guardrail) => {
      // The gateway does not redact yet; shipping these would turn them into another action.
      if (guardrail.action === "REDACT") return [];
      const config = GatewayRegexGuardrailConfigSchema.safeParse(
        guardrail.config,
      );
      const patterns = config.success
        ? config.data.presets.flatMap((preset) => [...presetPatterns(preset)])
        : [];
      // A guardrail with nothing to match is skipped rather than failing every request of the key.
      if (patterns.length === 0) {
        logger.error("Skipping gateway guardrail without known presets", {
          guardrailId: guardrail.id,
          organizationId: params.organizationId,
        });
        return [];
      }
      return [
        {
          id: guardrail.id,
          name: guardrail.name,
          action: guardrail.action === "BLOCK" ? "block" : "log",
          patterns,
        },
      ];
    });
  }
}
