import React from "react";
import { Heading, Section, Text } from "@react-email/components";

/** The unpaid plan whose usage limit a threshold email reports on. */
export type UsageThresholdPlan = "free-tier" | "enterprise-trial";

/** Completes "... event limit for ___". */
export const usageThresholdPlanPhrase: Record<UsageThresholdPlan, string> = {
  "free-tier": "the free tier",
  "enterprise-trial": "your Enterprise trial",
};

export const usageThresholdPlanName: Record<UsageThresholdPlan, string> = {
  "free-tier": "Free tier",
  "enterprise-trial": "Enterprise trial",
};

/** Closing upsell, shared by the warning and the suspension email. */
export const UsageThresholdUpgradeSection = ({
  plan,
}: {
  plan: UsageThresholdPlan;
}) =>
  plan === "enterprise-trial" ? (
    <Section className="mt-8">
      <Heading className="text-black text-[18px] font-semibold">
        Continue with Langfuse Enterprise
      </Heading>
      <Text className="text-gray-700 text-sm leading-6">
        Upgrade to a paid plan in your billing settings to keep ingesting
        without the trial limit, or reply to this email to talk to us about an
        Enterprise agreement.
      </Text>
    </Section>
  ) : (
    <Section className="mt-8">
      <Heading className="text-black text-[18px] font-semibold">
        Upgrade to Core at only $29/month
      </Heading>
      <Text className="text-gray-700 text-sm leading-6">
        When you upgrade, you can:
        <br />
        • Add unlimited number of users
        <br />
        • Retain data for 90 days
        <br />
        • Access unlimited evaluators
        <br />• Get support via Email/Chat
      </Text>
      <Text className="text-gray-700 text-sm leading-6 mt-4">
        <strong>Startup Program:</strong> Eligible startups get 50% off for
        their first year.{" "}
        <a
          href="https://langfuse.com/startups"
          className="text-blue-600 underline"
        >
          Learn more →
        </a>
      </Text>
    </Section>
  );
