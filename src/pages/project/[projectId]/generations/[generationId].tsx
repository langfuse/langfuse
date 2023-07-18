import { Button } from "@/src/components/ui/button";
import { CodeView, JSONView } from "@/src/components/ui/code";
import DescriptionList from "@/src/components/ui/description-lists";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import StatsCards from "@/src/components/stats-cards";
import { type Prisma } from "@prisma/client";

export default function GenerationPage() {
  const router = useRouter();
  const generationId = router.query.generationId as string;
  const projectId = router.query.projectId as string;

  const generation = api.generations.byId.useQuery(generationId, {
    enabled: generationId !== undefined,
  });

  const obsMetrics =
    generation.data?.scores.filter(
      (score) => score.observationId === generation.data.id
    ) ?? [];
  const traceScores =
    generation.data?.scores.filter((score) => !obsMetrics?.includes(score)) ??
    [];

  const statProps = [
    { name: "Model", stat: generation.data?.model ?? "-" },
    {
      name: "Temperature",
      stat: generation.data?.modelParameters?.temperature?.toString() ?? "-",
    },
    {
      name: "Max Tokens",
      stat: generation.data?.modelParameters?.maxTokens?.toString() ?? "-",
    },
    {
      name: "Top P",
      stat: generation.data?.modelParameters?.topP?.toString() ?? "-",
    },
  ];

  const jsonOutput = generation.data?.output as Prisma.JsonObject;

  return (
    <div className="container">
      <Header
        title="Generation"
        breadcrumb={[
          { name: "Generations", href: `/project/${projectId}/generations` },
          { name: generationId },
        ]}
      />
      <div className="my-10">
        <StatsCards stats={statProps} />
      </div>
      {generation.data ? (
        <DescriptionList
          items={[
            {
              label: "Trace",
              value: (
                <Button variant="secondary" asChild>
                  <Link
                    href={`/project/${projectId}/traces/${generation.data.traceId}`}
                  >
                    {generation.data.traceId}
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ),
            },
            {
              label: "Time",
              value: (
                <CodeView
                  content={[
                    `Start:\n${generation.data.startTime.toISOString()}`,
                    generation.data.completionStartTime !== null
                      ? "Completion start:\n" +
                        generation.data.completionStartTime.toISOString()
                      : null,
                    generation.data.endTime
                      ? "End:\n" + generation.data.endTime.toISOString()
                      : null,
                    "---",
                    generation.data.startTime !== null &&
                    generation.data.completionStartTime !== null
                      ? `First completion token:\n${
                          generation.data.completionStartTime.getTime() -
                          generation.data.startTime.getTime()
                        } ms`
                      : null,
                    generation.data.endTime !== null &&
                    generation.data.completionStartTime !== null
                      ? `Completion:\n${
                          generation.data.endTime.getTime() -
                          generation.data.completionStartTime.getTime()
                        } ms`
                      : null,
                    generation.data.endTime
                      ? "Total:\n" +
                        `${
                          generation.data.endTime.getTime() -
                          generation.data.startTime.getTime()
                        } ms`
                      : null,
                  ]
                    .filter((s) => s !== null)
                    .join("\n\n")}
                />
              ),
            },
            {
              label: "Name",
              value: generation.data.name,
            },
            {
              label: "Tokens",
              value: [
                generation.data.usage?.promptTokens &&
                  `${generation.data.usage.promptTokens} prompt tokens`,
                generation.data.usage?.completionTokens &&
                  `${generation.data.usage.completionTokens} completion tokens`,
              ]
                .filter(Boolean)
                .join(", "),
            },
            {
              label: "Prompt",
              value: generation.data.input ? (
                <JSONView json={generation.data.input as string} />
              ) : undefined,
            },
            {
              label: "Completion",
              value: jsonOutput ? (
                <CodeView
                  content={(jsonOutput["completion"] as string) ?? undefined}
                />
              ) : (
                <></>
              ),
            },
            {
              label: "Metadata",
              value: <JSONView json={generation.data.metadata} />,
            },
            {
              label: "Metrics (observation)",
              value: (
                <DescriptionList
                  items={obsMetrics.map((metric) => ({
                    label: metric.name,
                    value: (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
                        <div className="text-sm font-bold">
                          {metric.value.toString()}
                        </div>
                        {metric.comment !== null ? (
                          <div>
                            <div className="text-xs font-semibold text-gray-500">
                              Comment
                            </div>
                            <div className="text-sm">{metric.comment}</div>
                          </div>
                        ) : null}
                      </div>
                    ),
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
                    value: (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
                        <div className="text-sm font-bold">
                          {metric.value.toString()}
                        </div>
                        {metric.comment !== null ? (
                          <div>
                            <div className="text-xs font-semibold text-gray-500">
                              Comment
                            </div>
                            <div className="text-sm">{metric.comment}</div>
                          </div>
                        ) : null}
                      </div>
                    ),
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
