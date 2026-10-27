import {
  formatPhoneNumber,
  formatQueueTraceField,
  getQueueTraceColumnMetadataKeys,
  parseQueueTraceFieldDate,
  parseQueueTraceColumns,
  readQueueTraceField,
} from "./queueTraceColumns";
import { queueItemMatchesFilters } from "./queueItemFilters";

describe("parseQueueTraceColumns", () => {
  it("adds ids, defaults the format and skips invalid entries", () => {
    expect(
      parseQueueTraceColumns([
        { source: "trace", key: "userId", label: "Phone", format: "phone" },
        { source: "metadata", key: "location_name", label: "Location" },
        { source: "trace", key: "input", label: "Not a trace field" },
        "garbage",
      ]),
    ).toEqual([
      {
        id: "traceField-trace-userId",
        source: "trace",
        key: "userId",
        label: "Phone",
        format: "phone",
      },
      {
        id: "traceField-metadata-location_name",
        source: "metadata",
        key: "location_name",
        label: "Location",
        format: "text",
      },
    ]);
    expect(parseQueueTraceColumns(null)).toEqual([]);
  });
});

describe("readQueueTraceField", () => {
  const trace = {
    userId: "+12025550123",
    tags: ["region:eu-west", "workflow:support"],
    metadata: {
      location_name: "Berlin office",
      customer: JSON.stringify({ name: "Ada", visits: 3 }),
    },
  };

  it("reads trace fields, metadata keys and nested metadata paths", () => {
    expect(readQueueTraceField(trace, { source: "trace", key: "userId" })).toBe(
      "+12025550123",
    );
    expect(
      readQueueTraceField(trace, { source: "metadata", key: "location_name" }),
    ).toBe("Berlin office");
    expect(
      readQueueTraceField(trace, { source: "metadata", key: "customer.name" }),
    ).toBe("Ada");
    expect(
      readQueueTraceField(trace, { source: "metadata", key: "missing" }),
    ).toBeNull();
  });

  it("reads the part after a tag prefix", () => {
    expect(readQueueTraceField(trace, { source: "tag", key: "region:" })).toBe(
      "eu-west",
    );
    expect(
      readQueueTraceField(trace, { source: "tag", key: "loc:" }),
    ).toBeNull();
  });

  it("lists the top-level metadata keys to fetch", () => {
    expect(
      getQueueTraceColumnMetadataKeys([
        { source: "metadata", key: "customer.name" },
        { source: "metadata", key: "customer.visits" },
        { source: "tag", key: "region:" },
      ]),
    ).toEqual(["customer"]);
  });
});

describe("formatPhoneNumber", () => {
  it("uses national format for +1 and international format elsewhere", () => {
    expect(formatPhoneNumber("+12025550123")).toBe("(202) 555-0123");
    expect(formatPhoneNumber("+442079460123")).toBe("+44 20 7946 0123");
    expect(formatPhoneNumber("+989121234567")).toBe("+98 912 123 4567");
    expect(formatPhoneNumber("+4915123456789")).toBe("+49 1512 3456789");
  });

  it("keeps values that are not a valid number with a country code", () => {
    expect(formatPhoneNumber("2025550123")).toBe("2025550123");
    expect(formatPhoneNumber("anonymous")).toBe("anonymous");
  });
});

describe("formatQueueTraceField", () => {
  it("links http(s) URLs only", () => {
    expect(
      formatQueueTraceField("https://example.com/rec/1.mp3", "link"),
    ).toEqual({
      kind: "link",
      text: "https://example.com/rec/1.mp3",
      href: "https://example.com/rec/1.mp3",
    });
    expect(formatQueueTraceField("javascript:alert(1)", "link").kind).toBe(
      "text",
    );
  });

  it("formats numbers and durations, and falls back to text", () => {
    expect(formatQueueTraceField("1234567.5", "number").text).toBe(
      "1,234,567.5",
    );
    expect(formatQueueTraceField("135", "duration").text).toBe("2m 15s");
    expect(formatQueueTraceField("3725", "duration").text).toBe("1h 02m 05s");
    expect(formatQueueTraceField("n/a", "number").text).toBe("n/a");
  });

  it("reads ISO dates and Unix timestamps in seconds or milliseconds", () => {
    const iso = "2026-10-21T22:19:00.000Z";
    expect(parseQueueTraceFieldDate(iso)?.toISOString()).toBe(iso);
    expect(parseQueueTraceFieldDate("1792621140")?.toISOString()).toBe(iso);
    expect(parseQueueTraceFieldDate("1792621140000")?.toISOString()).toBe(iso);
    expect(parseQueueTraceFieldDate("soon")).toBeNull();
    const formatted = formatQueueTraceField(iso, "datetime");
    expect(formatted.kind === "text" && formatted.title).toContain("UTC");
  });

  it("gives a badge the same colour for the same value", () => {
    const first = formatQueueTraceField("support", "badge");
    const second = formatQueueTraceField("support", "badge");
    expect(first).toEqual(second);
    expect(first.kind).toBe("badge");
  });
});

describe("queueItemMatchesFilters with trace columns", () => {
  const [phone] = parseQueueTraceColumns([
    { source: "trace", key: "userId", label: "Phone", format: "phone" },
  ]);
  const row = {
    status: "PENDING",
    scores: [],
    traceFields: { [phone.id]: "+12025550123" },
  };
  const contains = (value: string) => ({
    column: "Phone",
    type: "string" as const,
    operator: "contains" as const,
    value,
  });

  it("matches the raw and the formatted value", () => {
    expect(queueItemMatchesFilters(row, [contains("+1202")], [], [phone])).toBe(
      true,
    );
    expect(
      queueItemMatchesFilters(row, [contains("(202) 555")], [], [phone]),
    ).toBe(true);
    expect(queueItemMatchesFilters(row, [contains("212")], [], [phone])).toBe(
      false,
    );
  });

  it("requires both forms to miss for does not contain", () => {
    expect(
      queueItemMatchesFilters(
        row,
        [{ ...contains("(202)"), operator: "does not contain" }],
        [],
        [phone],
      ),
    ).toBe(false);
  });

  it("uses number and date comparisons for those formats", () => {
    const [duration, callbackAt] = parseQueueTraceColumns([
      {
        source: "metadata",
        key: "seconds",
        label: "Length",
        format: "duration",
      },
      {
        source: "metadata",
        key: "callback",
        label: "Callback",
        format: "datetime",
      },
    ]);
    const timed = {
      status: "PENDING",
      scores: [],
      traceFields: {
        [duration.id]: "135",
        [callbackAt.id]: "2026-10-21T22:19:00.000Z",
      },
    };
    const columns = [duration, callbackAt];
    expect(
      queueItemMatchesFilters(
        timed,
        [{ column: "Length", type: "number", operator: ">", value: 120 }],
        [],
        columns,
      ),
    ).toBe(true);
    expect(
      queueItemMatchesFilters(
        timed,
        [
          {
            column: "Callback",
            type: "datetime",
            operator: "<",
            value: new Date("2026-10-21T00:00:00.000Z"),
          },
        ],
        [],
        columns,
      ),
    ).toBe(false);
  });
});
