import { ForbiddenError } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  isGatewayDeployedOnInstance,
  isGatewayEnabledForOrganization,
  requireGatewayEnabledForOrganization,
} from "./availability";

const PREVIEW_PR_URL = "https://github.com/langfuse/langfuse/pull/18561";

const deployedSelfHosted = {
  nodeEnv: "production",
  deployed: "true",
} as const;

describe("gateway organization allowlist", () => {
  it("matches organization IDs exactly", () => {
    const environment = {
      ...deployedSelfHosted,
      enabledForAllOrganizations: "false",
    } as const;

    expect(
      isGatewayEnabledForOrganization("org-1", ["org-1", "org-2"], environment),
    ).toBe(true);
    expect(isGatewayEnabledForOrganization("org", ["org-1"], environment)).toBe(
      false,
    );
    expect(() =>
      requireGatewayEnabledForOrganization("org", ["org-1"], environment),
    ).toThrow(ForbiddenError);
  });
});

describe("self-hosted deployments", () => {
  it("enables every organization of a deployed gateway unless disabled", () => {
    expect(
      isGatewayEnabledForOrganization("org-2", [], deployedSelfHosted),
    ).toBe(true);
    expect(
      isGatewayEnabledForOrganization("org-2", [], {
        ...deployedSelfHosted,
        enabledForAllOrganizations: "true",
      }),
    ).toBe(true);
    expect(
      isGatewayEnabledForOrganization("org-2", [], {
        ...deployedSelfHosted,
        enabledForAllOrganizations: "false",
      }),
    ).toBe(false);
  });

  it.each([undefined, "false"] as const)(
    "turns the gateway off when deployed is %s, despite flags and allowlist",
    (deployed) => {
      const notDeployed = {
        nodeEnv: "production",
        deployed,
        enabledForAllOrganizations: "true",
      } as const;

      expect(
        isGatewayEnabledForOrganization("org-1", ["org-1"], notDeployed),
      ).toBe(false);
      expect(() =>
        requireGatewayEnabledForOrganization("org-1", ["org-1"], notDeployed),
      ).toThrow(ForbiddenError);
    },
  );

  it.each([
    { environment: { nodeEnv: "production" }, expected: false },
    {
      environment: { nodeEnv: "production", deployed: "false" },
      expected: false,
    },
    { environment: deployedSelfHosted, expected: true },
    {
      environment: { nodeEnv: "production", cloudRegion: "EU" },
      expected: true,
    },
    { environment: { nodeEnv: "development" }, expected: true },
    {
      environment: { nodeEnv: "production", previewPrUrl: PREVIEW_PR_URL },
      expected: true,
    },
  ] as const)(
    "reports the instance gateway as deployed=$expected for $environment",
    ({ environment, expected }) => {
      expect(isGatewayDeployedOnInstance(environment)).toBe(expected);
    },
  );

  it.each([
    { nodeEnv: "development" },
    { nodeEnv: "production", previewPrUrl: PREVIEW_PR_URL },
  ])(
    "enables every organization on $nodeEnv / preview $previewPrUrl",
    (environment) => {
      for (const enabledForAllOrganizations of [
        undefined,
        "true",
        "false",
      ] as const) {
        expect(
          isGatewayEnabledForOrganization("org-2", [], {
            ...environment,
            enabledForAllOrganizations,
          }),
        ).toBe(true);
      }
    },
  );
});

describe("v4 write mode", () => {
  // Development otherwise enables every organization regardless of flags.
  it.each([deployedSelfHosted, { nodeEnv: "development" }] as const)(
    "turns the gateway off in legacy write mode for %o",
    (environment) => {
      const legacy = {
        ...environment,
        enabledForAllOrganizations: "true",
        writeMode: "legacy",
      } as const;

      expect(isGatewayEnabledForOrganization("org-1", ["org-1"], legacy)).toBe(
        false,
      );
      expect(() =>
        requireGatewayEnabledForOrganization("org-1", ["org-1"], legacy),
      ).toThrow(ForbiddenError);
    },
  );

  it.each(["dual", "events_only"] as const)(
    "keeps the gateway on in %s write mode",
    (writeMode) => {
      expect(
        isGatewayEnabledForOrganization("org-1", [], {
          ...deployedSelfHosted,
          writeMode,
        }),
      ).toBe(true);
    },
  );
});

describe("Langfuse Cloud matches the previous availability rule", () => {
  // The rule before LANGFUSE_AI_GATEWAY_DEPLOYED existed, when
  // LANGFUSE_AI_GATEWAY_ENABLED defaulted to "false".
  const previousRule = (
    organizationId: string,
    allowedOrganizationIds: string[],
    environment: {
      nodeEnv: string;
      previewPrUrl?: string;
      enabledForAllOrganizations?: "true" | "false";
    },
  ) =>
    environment.enabledForAllOrganizations === "true" ||
    environment.nodeEnv === "development" ||
    environment.previewPrUrl !== undefined ||
    allowedOrganizationIds.includes(organizationId);

  const cases = ["US", "EU", "STAGING", "DEV", "HIPAA", "JP"].flatMap(
    (cloudRegion) =>
      [undefined, "true", "false"].flatMap((enabledForAllOrganizations) =>
        [true, false].flatMap((allowlisted) =>
          [
            { name: "production", nodeEnv: "production" },
            { name: "development", nodeEnv: "development" },
            {
              name: "preview",
              nodeEnv: "production",
              previewPrUrl: PREVIEW_PR_URL,
            },
          ].flatMap((runtime) =>
            [undefined, "true", "false"].map((deployed) => ({
              cloudRegion,
              enabledForAllOrganizations: enabledForAllOrganizations as
                | "true"
                | "false"
                | undefined,
              allowlisted,
              runtime,
              deployed: deployed as "true" | "false" | undefined,
            })),
          ),
        ),
      ),
  );

  it.each(cases)(
    "$cloudRegion, ENABLED=$enabledForAllOrganizations, allowlisted=$allowlisted, $runtime.name, DEPLOYED=$deployed",
    ({
      cloudRegion,
      enabledForAllOrganizations,
      allowlisted,
      runtime,
      deployed,
    }) => {
      const allowlist = allowlisted ? ["org-1"] : ["org-2"];
      const environment = {
        nodeEnv: runtime.nodeEnv,
        previewPrUrl: runtime.previewPrUrl,
        enabledForAllOrganizations,
      };

      expect(
        isGatewayEnabledForOrganization("org-1", allowlist, {
          ...environment,
          cloudRegion,
          deployed,
        }),
      ).toBe(previousRule("org-1", allowlist, environment));
    },
  );
});
