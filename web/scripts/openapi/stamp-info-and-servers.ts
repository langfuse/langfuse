/**
 * Give the served spec a name, a version and the Langfuse Cloud regions.
 * `fern export` writes `title: server`, `version: ''` and no `servers`, so
 * agents and API clients that read the spec learn neither which API it
 * describes nor which hosts to call.
 *
 * Self-hosted instances serve this same file at /api/openapi.yaml, so the
 * first server is relative: it resolves to whichever instance serves the spec.
 */
export const API_TITLE = "Langfuse API";

export const API_SERVERS = [
  {
    url: "/",
    description: "The Langfuse instance that serves this spec",
  },
  {
    url: "https://cloud.langfuse.com",
    description: "Langfuse Cloud, EU data region",
  },
  {
    url: "https://us.cloud.langfuse.com",
    description: "Langfuse Cloud, US data region",
  },
  {
    url: "https://jp.cloud.langfuse.com",
    description: "Langfuse Cloud, Japan data region",
  },
  {
    url: "https://hipaa.cloud.langfuse.com",
    description: "Langfuse Cloud, HIPAA data region",
  },
] as const;

export function stampInfoAndServers(source: string, version: string): string {
  let out = source
    .replace(/^ {2}title: server$/m, `  title: ${API_TITLE}`)
    .replace(/^ {2}version: ''$/m, `  version: '${version}'`);
  if (!/^servers:/m.test(out)) {
    const servers = API_SERVERS.map(
      (server) =>
        `  - url: ${server.url}\n    description: ${server.description}`,
    ).join("\n");
    out = `${out.trimEnd()}\nservers:\n${servers}\n`;
  }
  return out;
}
