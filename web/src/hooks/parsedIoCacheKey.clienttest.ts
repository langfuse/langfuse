import { cheapHash } from "@/src/hooks/parsedIoCacheKey";

/**
 * The React Query cache key for parsed trace/observation I/O must identify a
 * field by a cheap, content-sensitive signature — never by embedding (and thus
 * re-serializing) the raw payload. These tests pin that accounting: the
 * signature never contains the payload text, is stable for identical content
 * (cache hit), and changes on ANY content change — including a same-length swap
 * (cache miss / re-parse), which a length-only key would have wrongly collided.
 */
describe("cheapHash", () => {
  it("returns a fixed marker for null / undefined", () => {
    expect(cheapHash(null)).toBe("∅");
    expect(cheapHash(undefined)).toBe("∅");
  });

  it("keys a string by length + hash, never by its content", () => {
    const big = "x".repeat(5_000_000);
    const sig = cheapHash(big);
    expect(sig).toMatch(/^s5000000:/);
    // The whole point of the fix: the multi-MB payload is NOT in the key.
    expect(sig.length).toBeLessThan(30);
    expect(sig).not.toContain("xxxx");
  });

  it("keys arrays and objects by size + content hash", () => {
    expect(cheapHash([1, 2, 3])).toMatch(/^a3:/);
    expect(cheapHash([])).toMatch(/^a0:/);
    expect(cheapHash({ a: 1, b: 2 })).toMatch(/^o2:/);
    expect(cheapHash({})).toMatch(/^o0:/);
  });

  it("keeps a large object's signature tiny — no payload text in the key", () => {
    const wide: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) wide[`k${i}`] = "y".repeat(10_000);
    const sig = cheapHash(wide);
    expect(sig).toMatch(/^o1000:/);
    expect(sig.length).toBeLessThan(40);
    expect(sig).not.toContain("yyyy");
  });

  it("keys primitives by their literal value", () => {
    expect(cheapHash(42)).toBe("p42");
    expect(cheapHash(true)).toBe("ptrue");
  });

  it("is stable for identical content (cache hit)", () => {
    expect(cheapHash("the same payload")).toBe(cheapHash("the same payload"));
    expect(cheapHash("z".repeat(4096))).toBe(cheapHash("z".repeat(4096)));
  });

  it("changes on ANY content change, including same length (cache miss / re-parse)", () => {
    // The regression this guards against: a refetch that swaps a field for
    // same-length different content (e.g. an SDK status update) must produce a
    // different signature, or the parse query would serve the stale cached
    // parse under staleTime: Infinity.
    expect(cheapHash("pending")).not.toBe(cheapHash("running")); // both len 7
    expect(cheapHash("hello")).not.toBe(cheapHash("world")); // both len 5
    // A length change also differs.
    expect(cheapHash("hello")).not.toBe(cheapHash("hi"));
    // Type namespaces never collide: a 5-char string vs a 5-element array.
    expect(cheapHash("abcde")).not.toBe(cheapHash([1, 2, 3, 4, 5]));
  });

  it("changes when an object/array value changes at the same shape", () => {
    // A Prisma JSON metadata field whose value changes but whose key-count
    // stays the same (e.g. {"status":"pending"} -> {"status":"running"}) must
    // still invalidate the parse — same class of collision as the string case.
    expect(cheapHash({ a: 1 })).not.toBe(cheapHash({ a: 2 }));
    expect(cheapHash({ status: "pending" })).not.toBe(
      cheapHash({ status: "running" }),
    );
    // Arrays too: same length, different element.
    expect(cheapHash([1, 2, 3])).not.toBe(cheapHash([1, 2, 4]));
    // ...and stable for identical object content (cache hit).
    expect(cheapHash({ a: 1, b: 2 })).toBe(cheapHash({ a: 1, b: 2 }));
  });
});
