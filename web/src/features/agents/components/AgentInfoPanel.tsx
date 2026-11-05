import { buildTracePath } from "@langfuse/shared";
import { type AgentDetailInput } from "@langfuse/shared/agents";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton } from "@/src/components/ui/skeleton";
import { api } from "@/src/utils/api";
import { AgentQueryError } from "./AgentQueryError";

export function AgentInfoPanel({ input }: { input: AgentDetailInput }) {
  const query = api.agents.info.useQuery(input);
  if (query.isError)
    return (
      <AgentQueryError
        retry={() => {
          query.refetch();
        }}
      />
    );
  if (query.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  const info = query.data;
  if (!info)
    return (
      <p className="text-muted-foreground p-4 text-sm">
        No agent information was observed in this time range and environment.
      </p>
    );
  const entries = [
    ["Agent ID", info.id ?? "Not recorded"],
    ["Identity", `${info.identity.kind}: ${info.identity.value}`],
    ["Environment", info.environment || "Empty environment"],
    ["Agent version", info.agentVersion ?? "Not recorded"],
    ["Instrumentation scope", info.scopeName ?? "Not recorded"],
    ["Scope version", info.scopeVersion ?? "Not recorded"],
    ["Service", info.serviceName ?? "Not recorded"],
    ["Service version", info.serviceVersion ?? "Not recorded"],
  ];
  return (
    <div className="ph-no-capture min-h-0 flex-1 overflow-y-auto p-4">
      <div className="flex max-w-5xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold">Last observed agent information</h2>
          <p className="text-muted-foreground text-xs">
            Recorded on {info.source.startTime.toLocaleString()} in{" "}
            {info.environment || "the empty environment"}. This is observed
            telemetry, not a managed agent configuration.
          </p>
          <TextLink
            path={buildTracePath({
              projectId: input.projectId,
              traceId: info.source.traceId,
              observationId: info.source.observationId,
              timestamp: info.source.startTime,
            })}
            value="Inspect source run"
          />
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {entries.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="mt-1 text-sm break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">
            Description{info.descriptionTruncated ? " (truncated)" : ""}
          </h2>
          <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
            {info.description ?? "No description was recorded."}
          </p>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold">Last observed model information</h2>
          {info.model ? (
            <>
              <p className="text-muted-foreground text-xs">
                A separate model observation associated with the source run. It
                does not establish the agent’s complete configuration.
              </p>
              <TextLink
                path={buildTracePath({
                  projectId: input.projectId,
                  traceId: info.model.sourceTraceId,
                  observationId: info.model.sourceObservationId,
                  timestamp: info.source.startTime,
                })}
                value="Inspect model source"
              />
              <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-xs">Model</dt>
                  <dd className="mt-1 text-sm break-words">
                    {info.model.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">
                    Observed prompt
                  </dt>
                  <dd className="mt-1 text-sm break-words">
                    {info.model.prompt
                      ? `${info.model.prompt.name}${info.model.prompt.version === null ? " · version not recorded" : ` · v${info.model.prompt.version}`}`
                      : "Not recorded"}
                  </dd>
                </div>
              </dl>
              <div>
                <h3 className="text-muted-foreground text-xs">
                  Model parameters
                  {info.model.parametersTruncated ? " (truncated)" : ""}
                </h3>
                <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3 text-xs break-words whitespace-pre-wrap">
                  {info.model.parameters ?? "Not recorded"}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No model information was observed for the source run.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
