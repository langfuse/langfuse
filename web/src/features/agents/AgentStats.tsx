import { type AgentSessionProjection } from "@langfuse/shared";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { formatAgentDuration } from "./profile/prepareAgentProfile";

export function AgentStats({
  agentName,
  projection,
}: {
  agentName: string;
  projection: AgentSessionProjection;
}) {
  const agent = projection.agents.find((item) => item.agentName === agentName);
  const current = agent?.current;
  const skills = projection.skills.filter(
    (skill) => skill.agentName === agentName && skill.invocations > 0,
  ).length;
  const items = [
    {
      label: "Sessions",
      value: compactNumberFormatter(current?.sessions ?? 0),
      description:
        "Distinct instrumented sessions containing this agent in the selected window.",
    },
    {
      label: "Tool calls",
      value: compactNumberFormatter(current?.toolInvocations ?? 0),
      description:
        "Executed TOOL observations explicitly attributed to this agent.",
    },
    {
      label: "Observed skills",
      value: String(skills),
      description:
        "Distinct observed skill names, matched from skill-loading tools.",
    },
    {
      label: "Avg. session duration",
      value: formatAgentDuration(current?.averageSessionDurationMs ?? null),
      description:
        "Mean whole-session observed wall-clock duration for qualifying session-backed activity.",
    },
    {
      label: "Attributed cost",
      value: usdFormatter(current?.cost ?? 0),
      description: "Exclusive cost on observations carrying this agent name.",
    },
    {
      label: "Tokens",
      value: compactNumberFormatter(current?.tokens ?? 0),
      description: "Tokens on observations carrying this agent name.",
    },
  ];
  return (
    <section
      aria-label="Agent statistics for the selected window"
      className="shrink-0 p-4"
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {items.map(({ label, value, description }) => (
          <div key={label} title={description}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          {compactNumberFormatter(current?.invocations ?? 0)} invocations ·{" "}
          {compactNumberFormatter(current?.traces ?? 0)} traces ·{" "}
          {compactNumberFormatter(current?.observations ?? 0)} observations
        </span>
        <span>
          Last known activity: {agent?.lastSeen?.toLocaleString() ?? "—"}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Cost belongs to explicitly named observations; sub-agent cost is
        excluded. Sessions may be shared by several agents.
      </p>
    </section>
  );
}
