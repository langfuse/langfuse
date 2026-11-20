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
    }
  | {
      type: "ORGANIZATION";
    };

type GatewaySpendLimitEmailLimit = {
  /** Lowercase interval, e.g. "daily"; "total" for a limit that never resets. */
  interval: string;
  limitUsd: number;
  /** Usage percentage that triggered the alert; 100 means the budget was reached. */
  thresholdPercent?: number;
  /** When the limit resets, formatted for display; absent for total limits. */
  resetsAt?: string;
};

type GatewaySpendLimitEmailTemplateProps = {
  /** The person the limit belongs to reads "your key"; an organization owner reads "the key". */
  audience: "keyOwner" | "orgOwner";
  orgName: string;
  scope: GatewaySpendLimitEmailScope;
  /** The limits one request triggered alerts for, at least one. */
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
  const subject = describeScope(scope, audience, orgName);
  const [onlyLimit] = limits.length === 1 ? limits : [];
  const onlyThreshold = onlyLimit ? getThresholdPercent(onlyLimit) : 100;
  const allExceeded = limits.every(
    (limit) => getThresholdPercent(limit) >= 100,
  );
  const hasExceeded = limits.some((limit) => getThresholdPercent(limit) >= 100);

  return (
    <Html>
      <Head />
      <Preview>
        {getPreviewText(subject.name, limits, onlyLimit, allExceeded)}
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
              <strong>{subject.name}</strong>{" "}
              {getHeadingAction(onlyLimit, onlyThreshold, allExceeded)}
            </Heading>
            <Text className="text-sm leading-6 text-black">
              {receiverName ? `Hello ${receiverName},` : "Hello,"}
            </Text>
            {onlyLimit ? (
              <SingleLimitBody
                subject={subject}
                orgName={orgName}
                limit={onlyLimit}
                thresholdPercent={onlyThreshold}
              />
            ) : (
              <>
                <Text className="text-sm leading-6 text-black">
                  <SubjectIntro subject={subject} orgName={orgName} />{" "}
                  {allExceeded
                    ? "has spent these budgets on the AI Gateway:"
                    : "has reached alerts for these budgets on the AI Gateway:"}
                </Text>
                <ul className="my-0 pl-5 text-sm leading-6 text-black">
                  {limits.map((limit) => {
                    const threshold = getThresholdPercent(limit);
                    return (
                      <li key={`${limit.interval}-${threshold}`}>
                        <strong>
                          {threshold < 100
                            ? `${threshold}% of ${formatLimit(limit)}`
                            : formatLimit(limit)}
                        </strong>
                        ,{" "}
                        {limit.resetsAt
                          ? `resets on ${limit.resetsAt}`
                          : "does not reset on its own"}
                      </li>
                    );
                  })}
                </ul>
                <Text className="text-sm leading-6 text-black">
                  {getMultipleLimitsOutcome(
                    subject.requests,
                    allExceeded,
                    hasExceeded,
                  )}
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
  limits: readonly Pick<GatewaySpendLimitEmailLimit, "thresholdPercent">[],
): string {
  const { noun, name, includeOrgInSubject } = describeScope(
    scope,
    "orgOwner",
    orgName,
  );
  const inOrg = includeOrgInSubject ? ` in "${orgName}"` : "";
  const prefix = `${noun[0]!.toUpperCase()}${noun.slice(1)} "${name}"`;
  if (limits.length === 1) {
    const threshold = getThresholdPercent(limits[0]!);
    const reached =
      threshold < 100 ? `${threshold}% of its budget` : "its budget";
    return `${prefix} reached ${reached}${inOrg}`;
  }
  const allExceeded = limits.every(
    (limit) => getThresholdPercent(limit) >= 100,
  );
  const reached = allExceeded
    ? `${limits.length} budgets`
    : `${limits.length} budget alerts`;
  return `${prefix} reached ${reached}${inOrg}`;
}

function SubjectIntro({
  subject,
  orgName,
}: {
  subject: ReturnType<typeof describeScope>;
  orgName: string;
}) {
  if (!subject.includeOrgInSubject) {
    return (
      <>
        {subject.label} <strong>{subject.name}</strong>
      </>
    );
  }
  return (
    <>
      {subject.label} <strong>{subject.name}</strong> ({subject.identifier}) in
      the <strong>{orgName}</strong> organization
    </>
  );
}

function SingleLimitBody({
  subject,
  orgName,
  limit,
  thresholdPercent,
}: {
  subject: ReturnType<typeof describeScope>;
  orgName: string;
  limit: GatewaySpendLimitEmailLimit;
  thresholdPercent: number;
}) {
  if (thresholdPercent < 100) {
    return (
      <Text className="text-sm leading-6 text-black">
        <SubjectIntro subject={subject} orgName={orgName} /> has reached{" "}
        <strong>{thresholdPercent}%</strong> of its{" "}
        <strong>{formatLimit(limit)}</strong> budget on the AI Gateway.{" "}
        {subject.requests} will be rejected once the budget is reached
        {limit.resetsAt ? `, until it resets on ${limit.resetsAt}` : ""}.
      </Text>
    );
  }
  return (
    <Text className="text-sm leading-6 text-black">
      <SubjectIntro subject={subject} orgName={orgName} /> has spent its{" "}
      <strong>{formatLimit(limit)}</strong> budget on the AI Gateway.{" "}
      {subject.requests} are rejected{" "}
      {limit.resetsAt
        ? `until the budget resets on ${limit.resetsAt}`
        : "until an admin raises or removes the budget"}
      .
    </Text>
  );
}

function getThresholdPercent(
  limit: Pick<GatewaySpendLimitEmailLimit, "thresholdPercent">,
) {
  return limit.thresholdPercent ?? 100;
}

function getPreviewText(
  subjectName: string,
  limits: readonly GatewaySpendLimitEmailLimit[],
  onlyLimit: GatewaySpendLimitEmailLimit | undefined,
  allExceeded: boolean,
) {
  if (onlyLimit) {
    const threshold = getThresholdPercent(onlyLimit);
    if (threshold < 100) {
      return `${subjectName} reached ${threshold}% of its ${formatLimit(onlyLimit)} budget`;
    }
    return `${subjectName} reached its ${formatLimit(onlyLimit)} budget`;
  }
  if (allExceeded) {
    return `${subjectName} reached ${limits.length} budgets`;
  }
  return `${subjectName} reached ${limits.length} budget alerts`;
}

function getHeadingAction(
  onlyLimit: GatewaySpendLimitEmailLimit | undefined,
  onlyThreshold: number,
  allExceeded: boolean,
) {
  if (onlyLimit) {
    if (onlyThreshold < 100) {
      return `reached ${onlyThreshold}% of its budget`;
    }
    return "reached its budget";
  }
  if (allExceeded) {
    return "reached its budgets";
  }
  return "reached budget alerts";
}

function getMultipleLimitsOutcome(
  requests: string,
  allExceeded: boolean,
  hasExceeded: boolean,
) {
  if (allExceeded) {
    return `${requests} are rejected until each of these budgets resets or is raised.`;
  }
  if (hasExceeded) {
    return `${requests} are rejected until each exceeded budget resets or is raised.`;
  }
  return `${requests} will be rejected once a budget is reached.`;
}

function formatLimit({ interval, limitUsd }: GatewaySpendLimitEmailLimit) {
  return `$${limitUsd.toFixed(2)} ${interval}`;
}

function describeScope(
  scope: GatewaySpendLimitEmailScope,
  audience: GatewaySpendLimitEmailTemplateProps["audience"],
  orgName: string,
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
        includeOrgInSubject: true,
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
        includeOrgInSubject: true,
      };
    case "ORGANIZATION":
      return {
        noun: "organization",
        label: "The organization",
        name: orgName,
        identifier: "",
        requests: "Requests in this organization",
        ownerReason: "you are an owner of this organization",
        linkLabel: "View gateway budgets",
        includeOrgInSubject: false,
      };
  }
}
