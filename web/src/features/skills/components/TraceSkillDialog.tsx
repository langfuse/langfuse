import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@langfuse/icons";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";

export function TraceSkillDialog({
  skill,
}: {
  skill: { name: string; version: number };
}) {
  const container = useLayerContainer("modal");
  const name = JSON.stringify(skill.name);
  const sdk = `import { LangfuseClient } from "@langfuse/client";
import { propagateAttributes } from "@langfuse/tracing";
import { runAgent } from "./agent";

const langfuse = new LangfuseClient();

// Fetch production (default), or choose a label or version.
const skill = await langfuse.api.skills.get(${name});
// const skill = await langfuse.api.skills.get(${name}, { label: "latest" });
// const skill = await langfuse.api.skills.get(${name}, { version: ${skill.version} });

await propagateAttributes(
  { skillsAvailable: [{ name: skill.name, version: skill.version }] },
  () => runAgent(skill),
);`;
  const pythonSdk = `from langfuse import Langfuse, propagate_attributes
from agent import run_agent

langfuse = Langfuse()

# Fetch production (default), or choose a label or version.
skill = langfuse.api.skills.get(${name})
# skill = langfuse.api.skills.get(${name}, label="latest")
# skill = langfuse.api.skills.get(${name}, version=${skill.version})

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
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/25 dark:bg-black/45" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="bg-modal fixed top-1/2 left-1/2 flex max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden shadow-lg sm:rounded-lg"
      >
        <DialogPrimitive.Title className="sr-only">
          Skill quick start
        </DialogPrimitive.Title>
        <Dialog.Body>
          <Tabs defaultValue="sdk">
            <div className="pr-8">
              <Tabs.List variant="underline" aria-label="Tracing integration">
                <Tabs.Trigger value="sdk" label="JS/TS SDK" />
                <Tabs.Trigger value="python-sdk" label="Python SDK" />
                <Tabs.Trigger value="otel" label="OTEL" />
              </Tabs.List>
            </div>
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
        <div className="absolute top-2 right-2">
          <DialogPrimitive.Close asChild>
            <IconButton icon={X} label="Close" variant="ghost" size="sm" />
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
