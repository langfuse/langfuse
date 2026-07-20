import {
  ByteJsonIndexEngine,
  loadByteJsonIndex,
  parseNumberPreservePrecision,
} from "@/src/components/ui/AdvancedJsonViewer/lazy/byteJsonIndex";

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

describe("byteJsonIndex", () => {
  describe("load", () => {
    it("describes an object root", () => {
      const { root } = loadByteJsonIndex(bytes(`{"a":1,"b":2}`));
      expect(root.nodeId).toBe(0);
      expect(root.type).toBe("object");
      expect(root.expandable).toBe(true);
      // childCount is unknown until the container is scanned.
      expect(root.childCount).toBeUndefined();
    });

    it("describes an array root", () => {
      const { root } = loadByteJsonIndex(bytes(`[1,2,3]`));
      expect(root.type).toBe("array");
      expect(root.expandable).toBe(true);
    });

    it("describes a primitive root as non-expandable", () => {
      const { root } = loadByteJsonIndex(bytes(`"hello"`));
      expect(root.type).toBe("string");
      expect(root.expandable).toBe(false);
    });

    it("ignores leading/trailing whitespace around the root", () => {
      const { root } = loadByteJsonIndex(bytes(`   \n\t {"a":1}  \n`));
      expect(root.type).toBe("object");
    });
  });

  describe("childrenPage", () => {
    it("returns object members with keys, types and order", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(
        bytes(`{"s":"x","n":42,"b":true,"z":null,"o":{},"a":[1]}`),
      );
      const page = engine.childrenPage(root.nodeId, 0, 100);
      expect(page.total).toBe(6);
      expect(page.hasMore).toBe(false);
      expect(page.children.map((c) => c.key)).toEqual([
        "s",
        "n",
        "b",
        "z",
        "o",
        "a",
      ]);
      expect(page.children.map((c) => c.type)).toEqual([
        "string",
        "number",
        "boolean",
        "null",
        "object",
        "array",
      ]);
      expect(page.children.map((c) => c.expandable)).toEqual([
        false,
        false,
        false,
        false,
        true,
        true,
      ]);
    });

    it("returns array elements with indices", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(bytes(`[10,20,30]`));
      const page = engine.childrenPage(root.nodeId, 0, 100);
      expect(page.children.map((c) => c.index)).toEqual([0, 1, 2]);
      expect(page.children.every((c) => c.key === undefined)).toBe(true);
    });

    it("handles empty containers", () => {
      const engine = new ByteJsonIndexEngine();
      const rootObj = engine.load(bytes(`{}`));
      expect(engine.childrenPage(rootObj.nodeId, 0, 10)).toMatchObject({
        total: 0,
        hasMore: false,
      });
      const rootArr = engine.load(bytes(`[]`));
      expect(engine.childrenPage(rootArr.nodeId, 0, 10).total).toBe(0);
    });

    it("paginates with offset/limit and reports hasMore", () => {
      const engine = new ByteJsonIndexEngine();
      const arr = `[${Array.from({ length: 250 }, (_, i) => i).join(",")}]`;
      const root = engine.load(bytes(arr));

      const p0 = engine.childrenPage(root.nodeId, 0, 100);
      expect(p0.total).toBe(250);
      expect(p0.children).toHaveLength(100);
      expect(p0.children[0].index).toBe(0);
      expect(p0.hasMore).toBe(true);

      const p2 = engine.childrenPage(root.nodeId, 200, 100);
      expect(p2.children).toHaveLength(50);
      expect(p2.children[0].index).toBe(200);
      expect(p2.children.at(-1)!.index).toBe(249);
      expect(p2.hasMore).toBe(false);
    });

    it("random-accesses a middle page correctly (offset table)", () => {
      const engine = new ByteJsonIndexEngine();
      const arr = `[${Array.from({ length: 1000 }, (_, i) => `"v${i}"`).join(",")}]`;
      const root = engine.load(bytes(arr));
      const page = engine.childrenPage(root.nodeId, 500, 3);
      expect(page.children.map((c) => c.index)).toEqual([500, 501, 502]);
      // materialize the middle element to confirm the offsets point at it
      expect(engine.getValue(page.children[1].nodeId).value).toBe("v501");
    });

    it("assigns stable nodeIds across repeated pages (caching)", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(bytes(`[1,2,3,4,5]`));
      const first = engine
        .childrenPage(root.nodeId, 0, 5)
        .children.map((c) => c.nodeId);
      const second = engine
        .childrenPage(root.nodeId, 0, 5)
        .children.map((c) => c.nodeId);
      expect(second).toEqual(first);
      // and the container now reports its childCount
      expect(engine.describeNode(root.nodeId).childCount).toBe(5);
    });

    it("exposes childCount only after a nested container is expanded", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(bytes(`{"outer":{"a":1,"b":2,"c":3}}`));
      const [outer] = engine.childrenPage(root.nodeId, 0, 10).children;
      expect(outer.type).toBe("object");
      expect(outer.childCount).toBeUndefined(); // not yet scanned
      const inner = engine.childrenPage(outer.nodeId, 0, 10);
      expect(inner.total).toBe(3);
      expect(engine.describeNode(outer.nodeId).childCount).toBe(3);
    });
  });

  describe("UTF-8 correctness", () => {
    it("decodes multi-byte keys and values without misreading offsets", () => {
      const engine = new ByteJsonIndexEngine();
      // emoji + CJK are multi-byte in UTF-8; none of their bytes collide with
      // ASCII structural bytes.
      const root = engine.load(bytes(`{"🔑":"café ☕","漢字":"日本語"}`));
      const page = engine.childrenPage(root.nodeId, 0, 10);
      expect(page.children.map((c) => c.key)).toEqual(["🔑", "漢字"]);
      expect(engine.getValue(page.children[0].nodeId).value).toBe("café ☕");
      expect(engine.getValue(page.children[1].nodeId).value).toBe("日本語");
    });

    it("does not treat brackets/quotes inside strings as structure", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(
        bytes(`{"tricky":"} ] { [ \\" , : ","after":7}`),
      );
      const page = engine.childrenPage(root.nodeId, 0, 10);
      expect(page.total).toBe(2);
      expect(page.children.map((c) => c.key)).toEqual(["tricky", "after"]);
      expect(engine.getValue(page.children[0].nodeId).value).toBe(
        `} ] { [ " , : `,
      );
      expect(engine.getValue(page.children[1].nodeId).value).toBe(7);
    });
  });

  describe("getValue precision", () => {
    it("returns safe integers as numbers", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(bytes(`[42]`));
      const [n] = engine.childrenPage(root.nodeId, 0, 1).children;
      const r = engine.getValue(n.nodeId);
      expect(r.value).toBe(42);
      expect(r.lossyNumber).toBe(false);
    });

    it("preserves out-of-safe-range integers as bigint", () => {
      const engine = new ByteJsonIndexEngine();
      // 2^53 + 1 is not representable as a JS number.
      const root = engine.load(bytes(`[9007199254740993]`));
      const [n] = engine.childrenPage(root.nodeId, 0, 1).children;
      const r = engine.getValue(n.nodeId);
      expect(typeof r.value).toBe("bigint");
      expect(r.value).toBe(9007199254740993n);
      expect(r.lossyNumber).toBe(true);
    });

    it("preserves long fractions as raw strings", () => {
      const engine = new ByteJsonIndexEngine();
      const lit = "0.12345678901234567890123456789";
      const root = engine.load(bytes(`[${lit}]`));
      const [n] = engine.childrenPage(root.nodeId, 0, 1).children;
      const r = engine.getValue(n.nodeId);
      expect(r.value).toBe(lit);
      expect(r.lossyNumber).toBe(true);
    });

    it("keeps short decimals as numbers", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(bytes(`[3.14,-2.5e3]`));
      const page = engine.childrenPage(root.nodeId, 0, 2);
      const a = engine.getValue(page.children[0].nodeId);
      const b = engine.getValue(page.children[1].nodeId);
      expect(a.value).toBe(3.14);
      expect(a.lossyNumber).toBe(false);
      expect(b.value).toBe(-2500);
      expect(b.lossyNumber).toBe(false);
    });

    it("parseNumberPreservePrecision unit cases", () => {
      expect(parseNumberPreservePrecision("42")).toEqual({
        value: 42,
        lossy: false,
      });
      expect(parseNumberPreservePrecision("9007199254740993")).toEqual({
        value: 9007199254740993n,
        lossy: true,
      });
      expect(parseNumberPreservePrecision("1e400")).toEqual({
        value: "1e400",
        lossy: true,
      });
    });
  });

  describe("getValue slicing", () => {
    it("materializes objects and arrays via a bounded slice", () => {
      const engine = new ByteJsonIndexEngine();
      const root = engine.load(bytes(`{"inner":{"x":[1,2,3],"y":"z"}}`));
      const [inner] = engine.childrenPage(root.nodeId, 0, 1).children;
      const r = engine.getValue(inner.nodeId);
      expect(r.type).toBe("object");
      expect(r.value).toEqual({ x: [1, 2, 3], y: "z" });
      expect(r.truncated).toBe(false);
    });

    it("truncates via maxBytes without throwing (TextDecoder path)", () => {
      const engine = new ByteJsonIndexEngine();
      const big = "x".repeat(5000);
      const root = engine.load(bytes(`["${big}"]`));
      const [s] = engine.childrenPage(root.nodeId, 0, 1).children;
      const r = engine.getValue(s.nodeId, 100);
      expect(r.truncated).toBe(true);
      expect(r.byteLength).toBeGreaterThan(5000);
      expect(typeof r.value).toBe("string");
      expect((r.value as string).length).toBe(100); // raw prefix, unparsed
    });
  });
});
