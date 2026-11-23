import type { PrismaClient } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

import type { GatewayResolveGuardrails } from "@/src/features/ai-gateway/server/provider/registry";
import { GatewayGuardrailRepository } from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailRepository";
import {
  GATEWAY_GUARDRAIL_PRESETS,
  GatewayRegexGuardrailConfigSchema,
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
      const config = GatewayRegexGuardrailConfigSchema.safeParse(
        guardrail.config,
      );
      // A config the gateway cannot evaluate is skipped rather than failing every request of the key.
      if (!config.success) {
        logger.error("Skipping gateway guardrail with an invalid config", {
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
          patterns: config.data.presets.flatMap((preset) => [
            ...GATEWAY_GUARDRAIL_PRESETS[preset],
          ]),
        },
      ];
    });
  }
}
