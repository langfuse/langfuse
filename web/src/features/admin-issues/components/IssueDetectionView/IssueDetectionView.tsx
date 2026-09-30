import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { EyeOff, Eye, Check, createLucideIcon } from "lucide-react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { IssueStatusTabs } from "@/src/features/admin-issues/components/IssueStatusTabs/IssueStatusTabs";
import {
  buildLocalIsoDatePresentation,
  getRelativeTimestampFromNow,
} from "@/src/utils/dates";

const CheckOff = createLucideIcon("CheckOff", [
  ["path", { d: "M20 6 9 17l-5-5", key: "check" }],
  ["path", { d: "M3 3 21 21", key: "slash" }],
]);

type Issue = {
  id: string;
  ruleName: string;
  group: string;
  description: string;
  priority: number;
  ctaLink: string | null;
  ctaLabel: string;
  createdAt: Date;
  doneAt: Date | null;
  ignoredAt: Date | null;
};

type Status = "open" | "done" | "ignored";
const groups: Record<string, string> = {
  integration: "Integration",
  sdks: "SDKs",
  evaluations: "Evaluations",
  prompts: "Prompts",
  other: "Other",
};

function statusOf(issue: Issue): Status {
  if (issue.ignoredAt) return "ignored";
  if (issue.doneAt) return "done";
  return "open";
}

function severity(priority: number) {
  if (priority <= 1) return { label: "Error", color: "red" as const };
  if (priority <= 3) return { label: "Warning", color: "yellow" as const };
  return { label: "Info", color: "blue" as const };
}

export function IssueDetectionView({
  issues,
  busyIssueId,
  onIgnore,
  onDone,
}: {
  issues: Issue[];
  busyIssueId: string | null;
  onIgnore: (issue: Issue, ignored: boolean) => void;
  onDone: (issue: Issue, done: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>("open");
  const visible = issues
    .filter((issue) => statusOf(issue) === status)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  const sections = Object.entries(groups)
    .map(([key, label]) => ({
      key,
      label,
      items: visible.filter((issue) => issue.group === key),
    }))
    .filter((section) => section.items.length > 0);
  const unknown = visible.filter((issue) => !(issue.group in groups));
  if (unknown.length)
    sections.push({ key: "unknown", label: "Other", items: unknown });
  sections.sort((a, b) => a.items[0]!.priority - b.items[0]!.priority);

  return (
    <Tabs value={status} onValueChange={(value) => setStatus(value as Status)}>
      <IssueStatusTabs />
      {(["open", "done", "ignored"] as const).map((value) => (
        <Tabs.Content key={value} value={value}>
          {sections.length === 0 ? (
            <p className="text-muted-foreground py-8 text-sm">
              No {value} issues.
            </p>
          ) : (
            <div className="flex flex-col gap-8 pt-6">
              {sections.map((section) => (
                <section key={section.key}>
                  <h3 className="mb-3 text-lg font-bold">{section.label}</h3>
                  <ul className="divide-y rounded-md border">
                    {section.items.map((issue) => {
                      const { label, color } = severity(issue.priority);
                      return (
                        <li
                          key={issue.id}
                          className="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap"
                        >
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <Badge text={label} color={color} />
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-bold">
                                  {issue.ruleName}
                                </span>
                                <time
                                  className="text-muted-foreground text-xs"
                                  dateTime={issue.createdAt.toISOString()}
                                  title={
                                    buildLocalIsoDatePresentation({
                                      date: issue.createdAt,
                                    })?.title
                                  }
                                >
                                  {getRelativeTimestampFromNow(issue.createdAt)}
                                </time>
                              </div>
                            </div>
                            <div className="text-muted-foreground [&_a]:text-primary-accent text-sm [&_a]:underline [&_p]:inline">
                              <ReactMarkdown>{issue.description}</ReactMarkdown>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center">
                            {value !== "done" && (
                              <IconButton
                                icon={value === "ignored" ? Eye : EyeOff}
                                label={
                                  value === "ignored" ? "Unignore" : "Ignore"
                                }
                                title={
                                  value === "ignored" ? "Unignore" : "Ignore"
                                }
                                disabled={busyIssueId !== null}
                                onClick={() =>
                                  onIgnore(issue, value !== "ignored")
                                }
                              />
                            )}
                            {value === "open" && (
                              <IconButton
                                icon={Check}
                                label="Mark done"
                                title="Mark done"
                                disabled={busyIssueId !== null}
                                onClick={() => onDone(issue, true)}
                              />
                            )}
                            {value === "done" && (
                              <IconButton
                                icon={CheckOff}
                                label="Mark undone"
                                title="Mark undone"
                                disabled={busyIssueId !== null}
                                onClick={() => onDone(issue, false)}
                              />
                            )}
                            {issue.ctaLink && (
                              <div className="ml-1">
                                <Button
                                  href={issue.ctaLink}
                                  text={issue.ctaLabel}
                                  size="sm"
                                  variant="secondary"
                                />
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Tabs.Content>
      ))}
    </Tabs>
  );
}
