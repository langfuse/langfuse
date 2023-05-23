import { Button } from "@/src/components/ui/button";
import { CodeView, JSONview } from "@/src/components/ui/code";
import DescriptionList from "@/src/components/ui/descriptionLists";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "~/components/layouts/header";

import { api } from "~/utils/api";

export default function LlmCallPage() {
  const router = useRouter();
  const { llmCallId } = router.query;

  const llmCall = api.llmCalls.byId.useQuery(llmCallId as string, {
    enabled: llmCallId !== undefined,
  });

  const obsMetrics =
    llmCall.data?.scores.filter(
      (score) => score.observationId === llmCall.data.id
    ) ?? [];
  const traceScores =
    llmCall.data?.scores.filter((score) => !obsMetrics?.includes(score)) ?? [];

  return (
    <>
      <Header
        title="LLM Call"
        breadcrumb={[
          { name: "LLM Calls", href: "/llm-calls" },
          { name: llmCallId as string },
        ]}
      />
      {llmCall.data ? (
        <DescriptionList
          items={[
            {
              label: "Trace",
              value: (
                <Button variant="secondary" asChild>
                  <Link href={`/traces/${llmCall.data.traceId}`}>
                    {llmCall.data.traceId}
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ),
            },
            {
              label: "Time",
              value:
                llmCall.data.startTime.toLocaleString() +
                (llmCall.data.endTime
                  ? ` - ${
                      llmCall.data.endTime.getTime() -
                      llmCall.data.startTime.getTime()
                    }ms`
                  : ""),
            },
            {
              label: "Name",
              value: llmCall.data.name,
            },
            {
              label: "Tokens",
              value: [
                llmCall.data.attributes.tokens.prompt &&
                  `${llmCall.data.attributes.tokens.prompt} prompt tokens`,
                llmCall.data.attributes.tokens.completion &&
                  `${llmCall.data.attributes.tokens.completion} completion tokens`,
              ]
                .filter(Boolean)
                .join(", "),
            },
            {
              label: "Prompt",
              value: <CodeView>{llmCall.data.attributes.prompt}</CodeView>,
            },
            {
              label: "Completion",
              value: <CodeView>{llmCall.data.attributes.completion}</CodeView>,
            },
            {
              label: "Model",
              value: <JSONview json={llmCall.data.attributes.model} />,
            },
            {
              label: "Attributes",
              value: <JSONview json={llmCall.data.attributes} />,
            },
            {
              label: "Metrics (observation)",
              value: (
                <DescriptionList
                  items={obsMetrics.map((metric) => ({
                    label: metric.name,
                    value: metric.value,
                  }))}
                />
              ),
            },
            {
              label: "Metrics (trace)",
              value: (
                <DescriptionList
                  items={traceScores.map((metric) => ({
                    label: metric.name,
                    value: metric.value,
                  }))}
                />
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
