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
  billingUrl: string;
  receiverEmail: string;
}

export const BillingAlertEmailTemplate = ({
  organizationName,
  currentUsage,
  threshold,
  billingUrl,
  receiverEmail,
}: BillingAlertEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        Your Langfuse Cloud usage is {`${currentUsage}`} events for the current
        billing period
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
                Usage Threshold Exceeded
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                Your organization &quot;{organizationName}&quot; has exceeded
                the configured billing threshold
              </Text>
            </Section>

            <Section className="mt-8">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <Row>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Current Usage (# Events)
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      {currentUsage}
                    </Text>
                  </Column>
                  <Column className="text-center">
                    <Text className="text-gray-600 text-sm font-medium m-0 mb-1">
                      Alert Threshold (# Events)
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900 m-0">
                      {threshold}
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
                View Billing Page and Manage Alerts
              </Button>
            </Section>

            <Section className="mt-8">
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
                This email was sent to {receiverEmail} regarding billing alerts
                for &quot;{organizationName}&quot;.
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
