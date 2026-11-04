import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { formatDistanceToNow } from "date-fns";
import { StringParam, useQueryParams } from "use-query-params";

import Page from "@/src/components/layouts/Page";
import { Button } from "@/src/components/design-system/Button/Button";
import { MarkdownView } from "@/src/components/ui/MarkdownView";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

export function ProductionReviewsPage() {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [params, setParams] = useQueryParams({ review: StringParam });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const reviewParam = typeof params.review === "string" ? params.review : null;

  const list = api.productionReviews.list.useQuery(
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) },
  );

  const listed = list.data?.some((item) => item.id === reviewParam) ?? false;
  const selectedId =
    reviewParam && (listed || reviewParam === pendingId)
      ? reviewParam
      : (list.data?.[0]?.id ?? null);

  const review = api.productionReviews.byId.useQuery(
    { projectId: projectId ?? "", id: selectedId ?? "" },
    { enabled: Boolean(projectId && selectedId) },
  );

  const create = api.productionReviews.create.useMutation();

  const runReview = () => {
    if (!projectId) return;
    create.mutate(
      { projectId },
      {
        onSuccess: (created) => {
          capture("production_review:created", { outcome: "ready" });
          utils.productionReviews.byId.setData(
            { projectId, id: created.id },
            created,
          );
          setPendingId(created.id);
          setParams({ review: created.id });
          utils.productionReviews.list.invalidate().catch(() => undefined);
        },
        onError: () => {
          capture("production_review:created", { outcome: "failed" });
        },
      },
    );
  };

  const runButton = () => (
    <Button
      text="Run review"
      loading={create.isPending}
      disabled={!projectId}
      onClick={runReview}
    />
  );

  return (
    <Page
      headerProps={{
        title: "Production reviews",
        actionButtonsRight: runButton(),
        mobileActionButtons: runButton(),
      }}
    >
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border-border min-h-0 overflow-y-auto border-b md:border-r md:border-b-0">
          <h2 className="sr-only">Reports</h2>
          {list.isLoading ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              Loading reports…
            </p>
          ) : null}
          {list.isError ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              Reports could not be loaded.
            </p>
          ) : null}
          {list.data && list.data.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              No reports yet.
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5 p-2">
            {list.data?.map((item) => (
              <li key={item.id}>
                <Link
                  href={{
                    pathname: `/project/${projectId}/production-reviews`,
                    query: { review: item.id },
                  }}
                  aria-current={item.id === selectedId ? "page" : undefined}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm",
                    item.id === selectedId
                      ? "bg-muted text-foreground font-bold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span>{item.title}</span>
                  <span className="text-xs">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <section className="min-h-0 overflow-y-auto p-4">
          {!selectedId && !list.isLoading ? (
            <p className="text-muted-foreground text-sm">
              Run a review to compare the last 24 hours with the day before.
            </p>
          ) : null}
          {selectedId && review.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading report…</p>
          ) : null}
          {review.data ? (
            <MarkdownView markdown={review.data.markdown} />
          ) : null}
          {review.isError ? (
            <p className="text-muted-foreground text-sm">
              This report could not be loaded.
            </p>
          ) : null}
        </section>
      </div>
    </Page>
  );
}
