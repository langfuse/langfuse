import { createHash } from "node:crypto";
import { z } from "zod/v4";
import type { EventRecordInsertType } from "../../../src/server/repositories/definitions";
import type { createActivityDemoApi } from "./agents-activity-demo-skills";
import { SeedError } from "./types";

const messagesSchema = z.array(
  z.object({ role: z.string(), content: z.unknown() }),
);
const storedPromptSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.literal("chat"),
  version: z.literal(1),
  prompt: messagesSchema,
});

/** Link authored model inputs to real, immutable prompt versions in the same project. */
export async function seedActivityDemoPrompts(
  request: Awaited<ReturnType<typeof createActivityDemoApi>>,
  idPrefix: string,
  events: EventRecordInsertType[],
) {
  const namespace = createHash("sha256")
    .update(idPrefix)
    .digest("hex")
    .slice(0, 12);
  const prompts = new Map<string, z.infer<typeof storedPromptSchema>>();
  for (const event of events.filter((row) => row.type === "GENERATION")) {
    const input = messagesSchema.safeParse(JSON.parse(event.input ?? "null"));
    const system = input.success
      ? input.data.find((message) => message.role === "system")
      : undefined;
    if (typeof system?.content !== "string" || !event.agent_id)
      throw new SeedError(
        "An activity demo model call is missing its agent's system prompt.",
      );
    const story =
      event.metadata_values?.[
        event.metadata_names?.indexOf("demo.story") ?? -1
      ];
    const role = event.agent_id.split(":").at(-1);
    const name = `agents-demo/${namespace}/${story}/${role}`;
    const prompt = [{ role: "system", content: system.content }];
    let stored = prompts.get(name);
    if (!stored) {
      const path = `/v2/prompts/${encodeURIComponent(name)}?version=1`;
      const found = await request(path);
      if (!found.ok)
        await request("/v2/prompts", {
          method: "POST",
          body: JSON.stringify({
            name,
            type: "chat",
            prompt,
            labels: ["production"],
            tags: ["synthetic", "agents-activity-demo"],
            commitMessage: "Seed an authored agent demonstration prompt",
          }),
        });
      const parsed = storedPromptSchema.safeParse(
        await (await request(path)).json(),
      );
      if (!parsed.success)
        throw new SeedError("The activity demo prompt readback was invalid.");
      stored = parsed.data;
      prompts.set(name, stored);
    }
    if (
      stored.name !== name ||
      JSON.stringify(stored.prompt) !== JSON.stringify(prompt)
    )
      throw new SeedError(
        "The activity demo prompt namespace contains different content; use a fresh --id-prefix.",
      );
    event.prompt_id = stored.id;
    event.prompt_name = stored.name;
    event.prompt_version = stored.version;
  }
  return [...prompts.values()].map(({ id, name, version }) => ({
    id,
    name,
    version,
  }));
}
