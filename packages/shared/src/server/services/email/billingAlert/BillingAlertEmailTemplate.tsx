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
  Preview,
  Section,
  Text,
  Tailwind,
  Row,
  Column,
} from "@react-email/components";

interface BillingAlertEmailProps {
  organizationName: string;
  currentUsage: number;
  threshold: number;
  currency: string;
  billingPeriod: string;
  usageBreakdown: {
    traces: number;
    observations: number;
    scores: number;
  };
  dashboardUrl: string;
  manageAlertsUrl: string;
  receiverEmail: string;
}

export const BillingAlertEmailTemplate = ({
  organizationName,
  currentUsage,
  threshold,
  billingPeriod,
  usageBreakdown,
  dashboardUrl,
  manageAlertsUrl,
  receiverEmail,
}: BillingAlertEmailProps) => {
  const overageAmount = currentUsage - threshold;
  const overagePercentage = ((overageAmount / threshold) * 100).toFixed(1);

  return (
    <Html>
      <Head />
      <Preview>
        Your current usage is ${currentUsage.toFixed(2)} for the {billingPeriod}{" "}
        billing period
      </Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
            <Section className="mt-[32px]">
              <Img
                src={`https://langfuse.com/langfuse-logo.png`}
                width="40"
                height="40"
                alt="Langfuse"
                className="my-0 mx-auto"
              />
            </Section>

            <Section className="text-center mt-[32px]">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center mb-2">
                  <div className="bg-orange-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                    !
                  </div>
                </div>
                <Heading className="text-orange-800 text-xl font-semibold mb-1">
                  Usage Threshold Exceeded
                </Heading>
                <Text className="text-orange-700 text-sm m-0">
                  {organizationName} has exceeded the configured billing
                  threshold
                </Text>
              </div>
            </Section>

            <Section className="mt-[32px]">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <Row>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Current Usage
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      ${currentUsage.toFixed(2)}
                    </Text>
                  </Column>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Alert Threshold
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      ${threshold.toFixed(2)}
                    </Text>
                  </Column>
                </Row>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <Row>
                    <Column className="text-center">
                      <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                        Billing Period
                      </Text>
                      <Text className="text-sm text-gray-900 m-0">
                        {billingPeriod}
                      </Text>
                    </Column>
                    <Column className="text-center">
                      <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                        Overage
                      </Text>
                      <Text className="text-sm font-semibold text-orange-600 m-0">
                        ${overageAmount.toFixed(2)} ({overagePercentage}%)
                      </Text>
                    </Column>
                  </Row>
                </div>
              </div>
            </Section>

            <Section className="mt-[32px]">
              <Heading className="text-black text-[18px] font-semibold">
                Usage Breakdown
              </Heading>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Text className="text-gray-700 text-sm m-0">Traces</Text>
                    <Text className="text-gray-900 text-sm font-medium m-0">
                      {usageBreakdown.traces.toLocaleString()} events
                    </Text>
                  </div>
                  <div className="flex justify-between">
                    <Text className="text-gray-700 text-sm m-0">
                      Observations
                    </Text>
                    <Text className="text-gray-900 text-sm font-medium m-0">
                      {usageBreakdown.observations.toLocaleString()} events
                    </Text>
                  </div>
                  <div className="flex justify-between">
                    <Text className="text-gray-700 text-sm m-0">Scores</Text>
                    <Text className="text-gray-900 text-sm font-medium m-0">
                      {usageBreakdown.scores.toLocaleString()} events
                    </Text>
                  </div>
                  <Hr className="border-gray-300 my-2" />
                  <div className="flex justify-between">
                    <Text className="text-gray-900 text-sm font-semibold m-0">
                      Total
                    </Text>
                    <Text className="text-gray-900 text-sm font-semibold m-0">
                      {(
                        usageBreakdown.traces +
                        usageBreakdown.observations +
                        usageBreakdown.scores
                      ).toLocaleString()}{" "}
                      events
                    </Text>
                  </div>
                </div>
              </div>
            </Section>

            <Section className="mt-[32px] text-center">
              <Button
                className="bg-blue-600 text-white px-6 py-3 rounded-md text-sm font-medium no-underline"
                href={dashboardUrl}
              >
                View Usage Dashboard
              </Button>
              <div className="mt-4">
                <Button
                  className="bg-gray-100 text-gray-700 px-6 py-3 rounded-md text-sm font-medium no-underline border border-gray-300"
                  href={manageAlertsUrl}
                >
                  Manage Alert Settings
                </Button>
              </div>
            </Section>

            <Section className="mt-[32px]">
              <Heading className="text-black text-[18px] font-semibold">
                What happens next?
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                • Your current billing cycle continues normally
                <br />
                • Charges will appear on your next invoice
                <br />
                • You can adjust usage or modify alert thresholds
                <br />• Contact support if you have questions about your bill
              </Text>
            </Section>

            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />

            <Section>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This email was sent to{" "}
                <span className="text-black">{receiverEmail}</span> regarding
                billing alerts for{" "}
                <span className="text-black">{organizationName}</span>.
              </Text>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                Questions? Contact us at{" "}
                <a
                  href="mailto:support@langfuse.com"
                  className="text-blue-600 no-underline"
                >
                  support@langfuse.com
                </a>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default BillingAlertEmailTemplate;
