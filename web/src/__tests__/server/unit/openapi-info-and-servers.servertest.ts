import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

import {
  API_SERVERS,
  API_TITLE,
  stampInfoAndServers,
} from "../../../../scripts/openapi/stamp-info-and-servers";

type OpenApiDocument = {
  info: { title: string; version: string };
  servers?: Array<{ url: string; description: string }>;
};

const SPEC = `openapi: 3.0.1
info:
  title: server
  version: ''
paths: {}
`;

function parseSpec(source: string): OpenApiDocument {
  return parse(source, { maxAliasCount: -1 }) as OpenApiDocument;
}

describe("OpenAPI info and servers", () => {
  it("stamps the title, the version and the Cloud regions", () => {
    const spec = parseSpec(stampInfoAndServers(SPEC, "1.2.3"));

    expect(spec.info).toEqual({ title: API_TITLE, version: "1.2.3" });
    expect(spec.servers).toEqual(API_SERVERS);
  });

  it("is idempotent", () => {
    const first = stampInfoAndServers(SPEC, "1.2.3");

    expect(stampInfoAndServers(first, "1.2.3")).toBe(first);
  });

  it("is applied to the generated public spec", () => {
    const openApiPath = path.resolve(
      process.cwd(),
      "public/generated/api/openapi.yml",
    );
    const spec = parseSpec(fs.readFileSync(openApiPath, "utf8"));

    expect(spec.info.title).toBe(API_TITLE);
    expect(spec.info.version).not.toBe("");
    expect(spec.servers).toEqual(API_SERVERS);
  });
});
