// CIP fork feature (see FORK.md): minimal submissions view — one row per
// submission with completion time and the answers, keyed to the published
// question titles.
import Page from "@/src/components/layouts/page";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { type Answer, type FormField } from "../lib/contract";

function formatValue(field: FormField | undefined, answer: Answer): string {
  const value = answer.value;
  if (value === null || value === undefined) return "–";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const labels = new Map(
      (field?.properties?.choices ?? []).map((c) => [c.id, c.label]),
    );
    return value.map((v) => labels.get(v) ?? v).join(", ");
  }
  if (typeof value === "object") {
    if ("initial" in value) {
      // AI interview transcript.
      const interview = value as {
        initial: string;
        exchanges?: { question: string; answer: string }[];
      };
      const parts = [interview.initial];
      for (const e of interview.exchanges ?? []) {
        parts.push(`↳ ${e.question}`, e.answer);
      }
      return parts.join("\n");
    }
    if ("ratings" in value) {
      const comparison = value as {
        ratings: Record<string, number>;
        preferred?: string;
        comment?: string;
      };
      const parts = Object.entries(comparison.ratings).map(
        ([, rating], i) => `${String.fromCharCode(65 + i)}: ${rating}/5`,
      );
      if (comparison.preferred)
        parts.push(`preferred: ${comparison.preferred}`);
      if (comparison.comment) parts.push(`"${comparison.comment}"`);
      return parts.join(" · ");
    }
    // Matrix / statement voting / stimulus rating records.
    const rowLabels = new Map(
      [
        ...(field?.properties?.rows ?? []),
        ...(field?.properties?.statements ?? []),
      ].map((r) => [r.id, r.label]),
    );
    const colLabels = new Map(
      (field?.properties?.columns ?? []).map((c) => [c.id, c.label]),
    );
    return Object.entries(value)
      .map(([k, v]) => {
        const row = rowLabels.get(k) ?? k;
        const cell =
          typeof v === "object" && v !== null && "rating" in v
            ? `${(v as { rating: number }).rating}/5`
            : (colLabels.get(String(v)) ?? String(v));
        return `${row}: ${cell}`;
      })
      .join(" · ");
  }
  return JSON.stringify(value);
}

export default function ElicitationSubmissions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const elicitationId = router.query.elicitationId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "elicitations:read",
  });

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 20),
  });

  const elicitation = api.elicitations.byId.useQuery(
    { projectId, elicitationId },
    { enabled: !!projectId && !!elicitationId && hasAccess },
  );
  const submissions = api.elicitations.submissions.useQuery(
    {
      projectId,
      elicitationId,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: !!projectId && !!elicitationId && hasAccess },
  );

  const fieldsById = useMemo(() => {
    const all = [
      ...(elicitation.data?.fields ?? []),
      ...(elicitation.data?.draftFields ?? []),
    ];
    return new Map(all.map((f) => [f.id, f]));
  }, [elicitation.data]);

  if (!hasAccess) return <SupportOrUpgradePage />;

  const totalCount = submissions.data?.totalCount ?? 0;
  const pageCount = Math.ceil(totalCount / paginationState.pageSize);

  return (
    <Page
      headerProps={{
        title: `Submissions${totalCount ? ` (${totalCount})` : ""}`,
        breadcrumb: [
          { name: "Elicitations", href: `/project/${projectId}/elicitations` },
          {
            name: elicitation.data?.name ?? "…",
            href: `/project/${projectId}/elicitations/${elicitationId}`,
          },
        ],
      }}
      scrollable
      withPadding
    >
      {submissions.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : submissions.data && submissions.data.submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No submissions yet. Share the public link to start collecting
          responses.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.data?.submissions.map((submission) => (
            <Card key={submission.id} className="p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(submission.completedAt).toLocaleString()}</span>
                {submission.startedAt && (
                  <span>
                    took{" "}
                    {Math.max(
                      1,
                      Math.round(
                        (new Date(submission.completedAt).getTime() -
                          new Date(submission.startedAt).getTime()) /
                          1000,
                      ),
                    )}
                    s
                  </span>
                )}
              </div>
              <dl className="flex flex-col gap-2">
                {submission.answers.map((answer) => {
                  const field = fieldsById.get(answer.field_id);
                  return (
                    <div key={answer.field_id}>
                      <dt className="text-xs font-medium text-muted-foreground">
                        {field?.title ?? answer.field_id}
                      </dt>
                      <dd className="whitespace-pre-wrap text-sm">
                        {formatValue(field, answer)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          ))}
          {pageCount > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={paginationState.pageIndex === 0}
                onClick={() =>
                  setPaginationState({
                    pageIndex: paginationState.pageIndex - 1,
                  })
                }
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {paginationState.pageIndex + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paginationState.pageIndex >= pageCount - 1}
                onClick={() =>
                  setPaginationState({
                    pageIndex: paginationState.pageIndex + 1,
                  })
                }
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
