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
export type GatewaySpendLimitEmailScope =
  | {
      type: "API_KEY";
      name: string;
      displaySecretKey: string;
    }
  | {
      type: "USER";
      name: string;
      email: string;
    };

type GatewaySpendLimitEmailLimit = {
  /** Lowercase interval, e.g. "daily"; "total" for a limit that never resets. */
  interval: string;
  limitUsd: number;
  /** When the limit resets, formatted for display; absent for total limits. */
  resetsAt?: string;
};

type GatewaySpendLimitEmailTemplateProps = {
  /** The person the limit belongs to reads "your key"; an organization owner reads "the key". */
  audience: "keyOwner" | "orgOwner";
  orgName: string;
  scope: GatewaySpendLimitEmailScope;
  /** The limits one request reached, at least one. */
  limits: GatewaySpendLimitEmailLimit[];
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
  limits,
  receiverEmail,
  receiverName,
  link,
  emailFromAddress,
}: GatewaySpendLimitEmailTemplateProps) => {
  const subject = describeScope(scope, audience);
  const [onlyLimit] = limits.length === 1 ? limits : [];

  return (
    <Html>
      <Head />
      <Preview>
        {onlyLimit
          ? `${subject.name} reached its ${formatLimit(onlyLimit)} budget`
          : `${subject.name} reached ${limits.length} budgets`}
      </Preview>
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
              <strong>{subject.name}</strong> reached its{" "}
              {onlyLimit ? "budget" : "budgets"}
            </Heading>
            <Text className="text-sm leading-6 text-black">
              {receiverName ? `Hello ${receiverName},` : "Hello,"}
            </Text>
            {onlyLimit ? (
              <Text className="text-sm leading-6 text-black">
                {subject.label} <strong>{subject.name}</strong> (
                {subject.identifier}) in the <strong>{orgName}</strong>{" "}
                organization has spent its{" "}
                <strong>{formatLimit(onlyLimit)}</strong> budget on the AI
                Gateway. {subject.requests} are rejected{" "}
                {onlyLimit.resetsAt
                  ? `until the budget resets on ${onlyLimit.resetsAt}`
                  : "until an admin raises or removes the budget"}
                .
              </Text>
            ) : (
              <>
                <Text className="text-sm leading-6 text-black">
                  {subject.label} <strong>{subject.name}</strong> (
                  {subject.identifier}) in the <strong>{orgName}</strong>{" "}
                  organization has spent these budgets on the AI Gateway:
                </Text>
                <ul className="my-0 pl-5 text-sm leading-6 text-black">
                  {limits.map((limit) => (
                    <li key={limit.interval}>
                      <strong>{formatLimit(limit)}</strong>,{" "}
                      {limit.resetsAt
                        ? `resets on ${limit.resetsAt}`
                        : "does not reset on its own"}
                    </li>
                  ))}
                </ul>
                <Text className="text-sm leading-6 text-black">
                  {subject.requests} are rejected until each of these budgets
                  resets or is raised.
                </Text>
              </>
            )}
            <Section className="mb-4 mt-8 text-center">
              {/* Note: link always refers to a root langfuse url and is not vulnerable to hyperlink injection attacks */}
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={link}
              >
                {subject.linkLabel}
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
                ? ` because ${subject.ownerReason}.`
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
  limitCount: number,
): string {
  const { noun, name } = describeScope(scope, "orgOwner");
  const reached = limitCount === 1 ? "its budget" : `${limitCount} budgets`;
  return `${noun[0]!.toUpperCase()}${noun.slice(1)} "${name}" reached ${reached} in "${orgName}"`;
}

function formatLimit({ interval, limitUsd }: GatewaySpendLimitEmailLimit) {
  return `$${limitUsd.toFixed(2)} ${interval}`;
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
        ownerReason: "you own this gateway key",
        linkLabel: "View gateway keys",
      };
    case "USER":
      return {
        noun: "gateway user",
        label: audience === "keyOwner" ? "Your gateway usage as" : "The user",
        name: scope.name,
        identifier: scope.email,
        requests: "Requests with this user's gateway keys",
        ownerReason: "this budget applies to you",
        linkLabel: "View gateway budgets",
      };
  }
}
