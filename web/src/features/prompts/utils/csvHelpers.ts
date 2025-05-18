import { parseCsvClient } from "@/src/features/datasets/lib/csvHelpers";
import type {
  CreatePromptType,
  LegacyValidatedPrompt,
  PromptType,
} from "@/src/features/prompts/server/utils/validation";

export function promptsToCsv(prompts: LegacyValidatedPrompt[]): string {
  const headers = [
    "name",
    "version",
    "type",
    "prompt",
    "labels",
    "tags",
    "config",
    "commitMessage",
  ];
  const lines = [headers.join(",")];
  for (const p of prompts) {
    const row = headers.map((h) => {
      let value: unknown = (p as any)[h];
      if (h === "labels" || h === "tags") {
        value = Array.isArray(value) ? (value as string[]).join("|") : "";
      } else if (h === "config" || (h === "prompt" && p.type === "chat")) {
        value = JSON.stringify(value ?? {});
      }
      if (value === undefined || value === null) value = "";
      const str = String(value).replace(/"/g, '""');
      return `"${str}"`;
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export async function parsePromptsCsv(file: File): Promise<CreatePromptType[]> {
  const prompts: CreatePromptType[] = [];
  let headers: string[] = [];
  await parseCsvClient(file, {
    processor: {
      onHeader: (h) => {
        headers = h.map((s) => s.trim());
      },
      onRow: (row) => {
        const map = new Map(headers.map((h, i) => [h, row[i]]));
        const type = (map.get("type") as PromptType | undefined) ?? "text";
        const promptValue = map.get("prompt") ?? "";
        const labels = map.get("labels")?.split("|").filter(Boolean) ?? [];
        const tags = map.get("tags")?.split("|").filter(Boolean) ?? [];
        const config = map.get("config") ? JSON.parse(map.get("config") as string) : {};
        const commitMessage = map.get("commitMessage") || undefined;
        const prompt = type === "chat" ? JSON.parse(promptValue as string) : promptValue;
        prompts.push({
          name: map.get("name") ?? "",
          type: type as PromptType,
          prompt: prompt as any,
          labels,
          tags,
          config,
          commitMessage: commitMessage as string | undefined,
        });
      },
    },
  });
  return prompts;
}
