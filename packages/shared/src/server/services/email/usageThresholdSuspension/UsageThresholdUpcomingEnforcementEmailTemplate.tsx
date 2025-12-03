import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Section,
  Text,
  Tailwind,
  Preview,
} from "@react-email/components";

interface UsageThresholdUpcomingEnforcementEmailProps {
  organizationName: string;
  currentUsage: number;
  limit: number;
  billingUrl: string;
  receiverEmail: string;
  resetDate: string; // ISO date string
}

export const UsageThresholdUpcomingEnforcementEmailTemplate = ({
  organizationName,
  currentUsage,
  limit,
  billingUrl,
  receiverEmail,
  resetDate,
}: UsageThresholdUpcomingEnforcementEmailProps) => {
  // Format reset date as "January 15, 2024"
  const formattedResetDate = new Date(resetDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <Html>
      <Head />
      <Preview>
        🚨 URGENT: Ingestion will be suspended for &quot;{organizationName}
        &quot; - action required
      </Preview>
      <Tailwind>
        <Body className="bg-background my-auto mx-auto font-sans">
          <Container className="mx-auto my-10 w-[465px] rounded border border-solid border-[#eaeaea] p-5">
            <Section className="mt-8">
              <Img
                src="https://static.langfuse.com/langfuse_logo_transactional_email.png"
                width="40"
                height="40"
                alt="Langfuse"
                className="mx-auto my-0"
              />
            </Section>

            <Section>
              <Heading className="mx-0 my-[30px] p-0 text-center text-2xl font-normal text-black">
                ⚠️ Action Required: Usage Limit Enforcement Begins Next Week
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                Your organization &quot;{organizationName}&quot; has exceeded
                the <strong>{limit.toLocaleString()} event limit</strong> for
                the free tier.
              </Text>
              <Text className="text-gray-700 text-sm leading-6 font-semibold">
                Beginning next week, we will begin enforcing usage limits. Based
                on your current usage, your account would be suspended and
                ingestion would stop.
              </Text>
            </Section>

            <Section className="mt-8">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                <Text className="text-orange-600 text-sm font-medium m-0 mb-1">
                  Current Usage
                </Text>
                <Text className="text-3xl font-bold text-orange-700 m-0">
                  {currentUsage.toLocaleString()}
                </Text>
                <Text className="text-orange-600 text-xs m-0 mt-1">
                  Free tier limit: {limit.toLocaleString()} events
                </Text>
              </div>
            </Section>

            <Section className="mt-8 text-center">
              <Button
                className="rounded bg-red-600 px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={billingUrl}
              >
                Upgrade Now to Ensure Uninterrupted Service
              </Button>
            </Section>

            <Section className="mt-8">
              <Heading className="text-black text-[18px] font-semibold">
                What happens beginning next week?
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                If you remain on the free tier and exceed the limit:
                <br />
                <br />•{" "}
                <strong>
                  New traces, observations, and scores cannot be ingested
                </strong>
                <br />
                • Existing data remains accessible
                <br />
                • Dashboard and analytics continue to work
                <br />• API calls to ingestion endpoints will return 403 errors
              </Text>
            </Section>

            <Section className="mt-8">
              <Heading className="text-black text-[18px] font-semibold">
                How to avoid service disruption:
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                •{" "}
                <strong>
                  Upgrade to a paid plan now to ensure uninterrupted operations
                </strong>
                <br />• Wait until your usage limit resets on{" "}
                <strong>{formattedResetDate}</strong> (though you may exceed it
                again)
                <br />• Contact support for custom plans and enterprise options
              </Text>
            </Section>

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
                <strong>Startup Program:</strong> Eligible startups get 50% off
                for their first year.{" "}
                <a
                  href="https://langfuse.com/startups"
                  className="text-blue-600 underline"
                >
                  Learn more →
                </a>
              </Text>
            </Section>

            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />

            <Section>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This important notification was sent to {receiverEmail}{" "}
                regarding upcoming usage enforcement for &quot;
                {organizationName}&quot;.
              </Text>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                Need immediate help? Simply reply to this email and we&apos;ll
                assist you right away.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default UsageThresholdUpcomingEnforcementEmailTemplate;
