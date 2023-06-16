import { Button } from "@/src/components/ui/button";
import { CodeView } from "@/src/components/ui/code";
import DescriptionList from "@/src/components/ui/description-lists";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import StatsCards from "@/src/components/stats-cards";
import Prompt from "@/src/components/prompts";

export default function LlmCallPage() {
  const router = useRouter();
  const llmCallId = router.query.llmCallId as string;
  const projectId = router.query.projectId as string;

  const llmCall = api.llmCalls.byId.useQuery(llmCallId, {
    enabled: llmCallId !== undefined,
  });

  const obsMetrics =
    llmCall.data?.scores.filter(
      (score) => score.observationId === llmCall.data.id
    ) ?? [];
  const traceScores =
    llmCall.data?.scores.filter((score) => !obsMetrics?.includes(score)) ?? [];

  const statProps = [
    { name: "Model", stat: llmCall.data?.attributes.model ?? "-" },
    {
      name: "Temperature",
      stat: llmCall.data?.attributes.temperature?.toString() ?? "-",
    },
    {
      name: "Max Tokens",
      stat: llmCall.data?.attributes.maxTokens?.toString() ?? "-",
    },
    { name: "Top P", stat: llmCall.data?.attributes.topP?.toString() ?? "-" },
  ];

  return (
    <div className="container">
      <Header
        title="LLM Call"
        breadcrumb={[
          { name: "LLM Calls", href: `/project/${projectId}/llm-calls` },
          { name: llmCallId },
        ]}
      />
      <div className="my-10">
        <StatsCards stats={statProps} />
      </div>
      {llmCall.data ? (
        <DescriptionList
          items={[
            {
              label: "Trace",
              value: (
                <Button variant="secondary" asChild>
                  <Link
                    href={`/project/${projectId}/traces/${llmCall.data.traceId}`}
                  >
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
                llmCall.data.attributes.tokens?.promptAmount &&
                  `${llmCall.data.attributes.tokens.promptAmount} prompt tokens`,
                llmCall.data.attributes.tokens?.completionAmount &&
                  `${llmCall.data.attributes.tokens.completionAmount} completion tokens`,
              ]
                .filter(Boolean)
                .join(", "),
            },
            {
              label: "Prompt",
              value: llmCall.data.attributes.prompt ? (
                <Prompt messages={llmCall.data.attributes.prompt} />
              ) : undefined,
            },
            {
              label: "Completion",
              value: <CodeView>{llmCall.data.attributes.completion}</CodeView>,
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
    </div>
  );
}
