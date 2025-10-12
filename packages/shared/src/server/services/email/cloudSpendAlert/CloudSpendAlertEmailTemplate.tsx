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

interface CloudSpendAlertEmailProps {
  organizationName: string;
  alertTitle: string;
  currentSpend: number;
  threshold: number;
  billingUrl: string;
  detectedAtUtc?: string;
  receiverEmail: string;
}

export const CloudSpendAlertEmailTemplate = ({
  organizationName,
  alertTitle,
  currentSpend,
  threshold,
  billingUrl,
  detectedAtUtc,
  receiverEmail,
}: CloudSpendAlertEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        {`Spend alert · ${organizationName} reached $${threshold.toFixed(2)}`}
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
                Spend alert: {alertTitle}
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                This is a notification you configured for &quot;
                {organizationName}&quot;. It indicates your current billing
                cycle spend has reached the limit you set. There are no service
                interruptions or immediate billing actions.
              </Text>
            </Section>

            <Section className="mt-8">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <Row>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Current Spend (USD)
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      {`$${currentSpend.toFixed(2)}`}
                    </Text>
                  </Column>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Alert Threshold (USD)
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      {`$${threshold.toFixed(2)}`}
                    </Text>
                  </Column>
                </Row>
                {detectedAtUtc ? (
                  <Row>
                    <Column className="text-center">
                      <Text className="text-gray-600 text-xs font-medium mt-3 mb-0">
                        Detected at (UTC)
                      </Text>
                      <Text className="text-sm text-gray-900 m-0">
                        {detectedAtUtc}
                      </Text>
                    </Column>
                  </Row>
                ) : null}
              </div>
            </Section>

            <Section className="mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={billingUrl}
              >
                View Billing & Manage Spend Alerts
              </Button>
            </Section>

            <Section className="mt-8">
              <Heading className="text-black text-[18px] font-semibold">
                No immediate action required
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                • Ingestions and billing continue as normal
                <br />
                • This email is informational; it reflects a threshold you
                configured
                <br />
                • Manage thresholds or review usage in your billing settings
                <br />• This alert won’t trigger again until the next billing
                cycle
              </Text>
            </Section>

            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />

            <Section>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This email was sent to {receiverEmail} regarding spend alerts
                for &quot;{organizationName}&quot;.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default CloudSpendAlertEmailTemplate;
