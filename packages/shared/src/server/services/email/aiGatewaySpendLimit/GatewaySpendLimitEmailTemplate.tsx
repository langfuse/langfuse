import * as React from "react";
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
  Tailwind,
  Text,
} from "@react-email/components";

/** What the limit applies to; one variant per spend limit scope. */
export type GatewaySpendLimitEmailScope = {
  type: "API_KEY";
  name: string;
  displaySecretKey: string;
};

type GatewaySpendLimitEmailTemplateProps = {
  /** The key's owner reads "your key"; an organization owner reads "the key". */
  audience: "keyOwner" | "orgOwner";
  orgName: string;
  scope: GatewaySpendLimitEmailScope;
  /** Lowercase interval, e.g. "daily"; "total" for a limit that never resets. */
  interval: string;
  limitUsd: number;
  /** When the limit resets, formatted for display; absent for total limits. */
  resetsAt?: string;
  receiverEmail: string;
  /** Greets the receiver by name when known. */
  receiverName?: string;
  link: string;
  emailFromAddress: string;
};

export const GatewaySpendLimitEmailTemplate = ({
  audience,
  orgName,
  scope,
  interval,
  limitUsd,
  resetsAt,
  receiverEmail,
  receiverName,
  link,
  emailFromAddress,
}: GatewaySpendLimitEmailTemplateProps) => {
  const limit = `$${limitUsd.toFixed(2)} ${interval}`;
  const subject = describeScope(scope, audience);
  const until = resetsAt
    ? `until the limit resets on ${resetsAt}`
    : "until an admin resets or raises the limit";

  return (
    <Html>
      <Head />
      <Preview>{`${subject.name} reached its ${limit} spend limit`}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-background font-sans">
          <Container className="mx-auto my-10 w-[465px] max-w-[465px] table-fixed rounded border border-solid border-[#eaeaea] p-5 [overflow-wrap:anywhere]">
            <Section className="mt-8">
              <Img
                src="https://static.langfuse.com/langfuse_logo_transactional_email.png"
                width="40"
                height="26"
                alt="Langfuse"
                className="mx-auto my-0 h-[26px] w-[40px] max-w-full"
              />
            </Section>
            <Heading className="mx-0 my-[30px] p-0 text-center text-2xl font-normal text-black">
              <strong>{subject.name}</strong> reached its spend limit
            </Heading>
            <Text className="text-sm leading-6 text-black">
              {receiverName ? `Hello ${receiverName},` : "Hello,"}
            </Text>
            <Text className="text-sm leading-6 text-black">
              {subject.label} <strong>{subject.name}</strong> (
              {subject.identifier}) in the <strong>{orgName}</strong>{" "}
              organization has spent its <strong>{limit}</strong> limit on the
              AI Gateway. {subject.requests} are rejected {until}.
            </Text>
            <Section className="mb-4 mt-8 text-center">
              {/* Note: link always refers to a root langfuse url and is not vulnerable to hyperlink injection attacks */}
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={link}
              >
                View gateway keys
              </Button>
            </Section>
            <Text className="text-sm leading-6 text-black">
              or copy and paste this URL into your browser:{" "}
              <span className="break-all text-blue-600 no-underline">
                {link}
              </span>
            </Text>
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This email was intended for{" "}
              <span className="text-black">{receiverEmail}</span>. It was sent
              from <span className="text-black">{emailFromAddress}</span>
              {audience === "keyOwner"
                ? ` because you own this ${subject.noun}.`
                : " because you are an owner of this organization."}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export function getGatewaySpendLimitEmailSubject(
  scope: GatewaySpendLimitEmailScope,
  orgName: string,
): string {
  const { noun, name } = describeScope(scope, "orgOwner");
  return `${noun[0]!.toUpperCase()}${noun.slice(1)} "${name}" reached its spend limit in "${orgName}"`;
}

function describeScope(
  scope: GatewaySpendLimitEmailScope,
  audience: GatewaySpendLimitEmailTemplateProps["audience"],
) {
  switch (scope.type) {
    case "API_KEY":
      return {
        noun: "gateway key",
        label: audience === "keyOwner" ? "Your gateway key" : "The gateway key",
        name: scope.name,
        identifier: scope.displaySecretKey,
        requests: "Requests with this key",
      };
  }
}
