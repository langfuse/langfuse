import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useState } from "react";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { Card } from "@/src/components/ui/card";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { env } from "@/src/env.mjs";

export default function QueryPlayground() {
  const session = useSession();
  const isCloudAdmin =
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined &&
    session.data?.user?.admin === true;

  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [queryCode, setQueryCode] = useState<string>(`{
  "view": "traces",
  "dimensions": [{ "field": "name" }],
  "metrics": [{ "measure": "count", "aggregation": "count" }],
  "filters": [],
  "timeDimension": {
    "granularity": "day"
  },
  "fromTimestamp": "${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}",
  "toTimestamp": "${new Date().toISOString()}",
  "orderBy": null
}`);
  const [error, setError] = useState<string | null>(null);

  // Query execution state
  const [queryInput, setQueryInput] = useState<any>(null);

  // Execute query mutation
  const { data, isLoading } = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: queryInput?.query || {
        view: "traces",
        dimensions: [],
        metrics: [],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        toTimestamp: new Date().toISOString(),
        page: 0,
        limit: 10,
      },
    },
    {
      enabled: !!queryInput, // Only run the query when queryInput is set (via button click)
      retry: false,
    },
  );

  const executeQuery = () => {
    setError(null);
    try {
      // Parse the JSON query
      const parsedQuery = JSON.parse(queryCode);
      setQueryInput({
        projectId,
        query: parsedQuery,
      });
    } catch (err) {
      setError(`Invalid JSON: ${(err as Error).message}`);
    }
  };

  return (
    isCloudAdmin && (
      <Page
        headerProps={{
          title: "Query Playground",
          help: {
            description:
              "Test and visualize queries using Langfuse's query builder",
            href: "https://langfuse.com/docs", // Update with actual docs link when available
          },
        }}
      >
        <div className="flex h-full flex-col gap-4 overflow-hidden">
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden">
            {/* Query Editor */}
            <Card className="flex flex-col overflow-hidden p-4">
              <h2 className="mb-2 text-lg font-medium">Query</h2>
              <div className="flex-1 overflow-hidden">
                <CodeMirrorEditor
                  value={queryCode}
                  onChange={setQueryCode}
                  mode="json"
                  className="h-full"
                  minHeight={100}
                />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-red-500">{error}</div>
                <Button
                  onClick={executeQuery}
                  disabled={isLoading && !!queryInput}
                >
                  {isLoading && !!queryInput ? "Running..." : "Run Query"}
                </Button>
              </div>
            </Card>

            {/* Results */}
            <Card className="flex flex-col overflow-hidden p-4">
              <h2 className="mb-2 text-lg font-medium">Results</h2>
              <div className="flex-1 overflow-auto">
                {data ? (
                  <div className="h-full overflow-auto">
                    <MarkdownJsonView content={data} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-muted-foreground">
                    {isLoading && !!queryInput
                      ? "Loading results..."
                      : error
                        ? "Query error"
                        : "Write a query and click 'Run Query' to see results"}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </Page>
    )
  );
}
