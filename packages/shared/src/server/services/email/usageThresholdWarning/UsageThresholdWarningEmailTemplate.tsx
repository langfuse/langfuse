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
  Row,
  Column,
  Preview,
} from "@react-email/components";

interface UsageThresholdWarningEmailProps {
  organizationName: string;
  currentUsage: number;
  limit: number;
  billingUrl: string;
  receiverEmail: string;
  resetDate: string; // ISO date string
}

export const UsageThresholdWarningEmailTemplate = ({
  organizationName,
  currentUsage,
  limit,
  billingUrl,
  receiverEmail,
  resetDate,
}: UsageThresholdWarningEmailProps) => {
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
        Your Langfuse organization &quot;{organizationName}&quot; has reached{" "}
        {currentUsage.toLocaleString()} events
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
                Usage Threshold Reached
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                Your organization &quot;{organizationName}&quot; has reached{" "}
                <strong>{currentUsage.toLocaleString()}</strong> events out of
                your <strong>{limit.toLocaleString()}</strong> event limit for
                the free tier.
              </Text>
            </Section>

            <Section className="mt-8">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <Row>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Current Usage
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      {currentUsage.toLocaleString()}
                    </Text>
                  </Column>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Threshold
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      {limit.toLocaleString()}
                    </Text>
                  </Column>
                </Row>
              </div>
            </Section>

            <Section className="mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={billingUrl}
              >
                Upgrade Your Plan
              </Button>
            </Section>

            <Section className="mt-8">
              <Heading className="text-black text-[18px] font-semibold">
                What happens next?
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                • Your usage continues to be tracked for a grace period
                <br />
                • Ingestion will soon be suspended and incoming observations,
                traces, and scores will be dropped unless you upgrade
                <br />• Your usage limit resets on{" "}
                <strong>{formattedResetDate}</strong>
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
                This email was sent to {receiverEmail} regarding usage alerts
                for &quot;{organizationName}&quot;.
              </Text>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                Questions? Simply reply to this email and we&apos;ll be happy to
                help.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default UsageThresholdWarningEmailTemplate;
