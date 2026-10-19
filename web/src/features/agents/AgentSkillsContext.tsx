import { type AgentSessionProjection } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";

export function AgentSkillsContext({
  agentName,
  projection,
}: {
  agentName: string;
  projection: AgentSessionProjection;
}) {
  const availableSkills =
    projection.agents.find((agent) => agent.agentName === agentName)
      ?.availableSkillNames ?? [];
  return (
    <section aria-label="Skill context" className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-bold">Skill evidence</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Native resource-load references take precedence. Older observations
          use bounded tool-name and input matching. Definition links match exact
          catalog names; they do not establish the loaded version.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">Available skill declarations</h3>
        {availableSkills.length > 0 ? (
          <div className="ph-no-capture flex flex-wrap gap-2">
            {availableSkills.map((name) => (
              <Badge key={name} text={name} color="filled" />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            No available-skill declarations were observed in discovery history.
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Declarations were recorded during the bounded discovery lookback. They
          do not establish the current deployment&apos;s configuration or
          observed loads.
        </p>
      </div>
    </section>
  );
}
