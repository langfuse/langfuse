// @vitest-environment node

import { getMaintainer } from "./typeHelpers";

describe("getMaintainer", () => {
  const format = (key: string, values?: Record<string, string>): string => {
    if (key === "maintainers.partner") return `Betreut von ${values?.partner}`;
    if (key === "maintainers.langfuse") return "Betreut von Langfuse";
    if (key === "maintainers.user") return "Vom Benutzer betreut";
    if (key === "maintainers.unknownPartner") return "Unbekannt";
    return key;
  };

  it("uses an injected formatter for built-in, partner, and user maintainers", () => {
    expect(getMaintainer({ partner: "ragas", projectId: null }, format)).toBe(
      "Betreut von Ragas",
    );
    expect(getMaintainer({ projectId: null }, format)).toBe(
      "Betreut von Langfuse",
    );
    expect(getMaintainer({ projectId: "project" }, format)).toBe(
      "Vom Benutzer betreut",
    );
  });
});
