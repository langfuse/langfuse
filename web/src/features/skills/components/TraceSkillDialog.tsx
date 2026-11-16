import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

export function TraceSkillDialog({
  skill,
}: {
  skill: { name: string; version: number };
}) {
  const name = JSON.stringify(skill.name);
  const sdk = `import { LangfuseClient } from "@langfuse/client";
import { propagateAttributes } from "@langfuse/tracing";
import { runAgent } from "./agent";

const langfuse = new LangfuseClient();

// Fetch production (default), or choose a label or version.
const skill = await langfuse.api.skills.get(${name}, { includeContent: true });
// const skill = await langfuse.api.skills.get(${name}, { label: "latest", includeContent: true });
// const skill = await langfuse.api.skills.get(${name}, { version: ${skill.version}, includeContent: true });

await propagateAttributes(
  { skillsAvailable: [{ name: skill.name, version: skill.version }] },
  () => runAgent(skill),
);`;
  const pythonSdk = `from langfuse import Langfuse, propagate_attributes
from agent import run_agent

langfuse = Langfuse()

# Fetch production (default), or choose a label or version.
skill = langfuse.api.skills.get(${name}, include_content=True)
# skill = langfuse.api.skills.get(${name}, label="latest", include_content=True)
# skill = langfuse.api.skills.get(${name}, version=${skill.version}, include_content=True)

with propagate_attributes(
    skills_available=[{"name": skill.name, "version": skill.version}],
):
    run_agent(skill)`;
  const otel = JSON.stringify(
    { "langfuse.observation.skills_available": JSON.stringify([skill]) },
    null,
    2,
  );

  return (
    <Dialog title="Quick Start" size="md">
      <Dialog.Body>
        <Tabs defaultValue="sdk">
          <Tabs.List variant="underline" aria-label="Tracing integration">
            <Tabs.Trigger value="sdk" label="JS/TS SDK" />
            <Tabs.Trigger value="python-sdk" label="Python SDK" />
            <Tabs.Trigger value="otel" label="OTEL" />
          </Tabs.List>
          <Tabs.Content value="sdk">
            <div className="pt-3">
              <CodeSection content={sdk} language="typescript" />
            </div>
          </Tabs.Content>
          <Tabs.Content value="python-sdk">
            <div className="pt-3">
              <CodeSection content={pythonSdk} language="python" />
            </div>
          </Tabs.Content>
          <Tabs.Content value="otel">
            <div className="pt-3">
              <CodeSection content={otel} language="json" />
            </div>
          </Tabs.Content>
        </Tabs>
      </Dialog.Body>
    </Dialog>
  );
}
