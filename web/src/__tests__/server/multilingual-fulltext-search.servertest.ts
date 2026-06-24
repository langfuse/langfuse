/**
 * Tests for GitHub issue #11538 — "Full-text search fails for non-English text".
 *
 * Background
 * ----------
 * When a trace / observation is ingested through the OpenTelemetry path (which is what the
 * Langfuse Python SDK v3 uses, and what the bug reporter used), its `input` / `output`
 * payload is stored in ClickHouse **verbatim as the JSON string the SDK produced**. Python's
 * `json.dumps(...)` defaults to `ensure_ascii=True`, so a value like `你好` is persisted on
 * disk as the literal 12-byte ASCII string `\u4f60\u597d`. The UI's display layer parses that
 * JSON back, so the user *sees* `你好` — but full-text search (`clickhouseSearchCondition`)
 * runs a literal `input ILIKE '%你好%'`, which can never match the stored bytes `\u4f60\u597d`.
 * ASCII text (`Hello`) is not escaped, so it matches.
 *
 * These tests reproduce that: they store trace/observation I/O in the exact escaped form the
 * Python SDK produces (via `pythonJsonDumps`, an `ensure_ascii=True` equivalent), then search
 * for the *raw* (human-readable) text and assert it is found. Today they all FAIL. After the
 * fix to `clickhouseSearchCondition` (also matching the `\uXXXX`-escaped form of the query),
 * they must all PASS.
 *
 * Coverage: one integration test per writing system used by ≥ 1 million people (with separate
 * tests for Simplified and Traditional Chinese characters), plus edge cases (input-only /
 * output-only search, mixed Latin+CJK queries, astral-plane / surrogate-pair characters,
 * observations search, the issue's exact end-to-end scenario) and a few unit assertions on the
 * SQL builder. Testing-Trophy weighting: heavy on integration, light on unit.
 */
import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  clickhouseSearchCondition,
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
  getTraceById,
} from "@langfuse/shared/src/server";
import { type TracingSearchType } from "@langfuse/shared";
import { makeAPICall } from "@/src/__tests__/test-utils";
import waitForExpect from "wait-for-expect";
import { randomUUID } from "crypto";

const directTrpcClickHouseQueryTags = {
  surface: "trpc" as const,
  route: "multilingual-fulltext-search.servertest",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `\u`-escapes every code point >= U+0080 (astral code points become a UTF-16 surrogate pair),
 * leaving ASCII untouched. This mirrors what a JSON serializer with `ensure_ascii=True`
 * (Python's `json.dumps` default, used by the Langfuse Python SDK's EventSerializer) emits.
 */
function escapeNonAscii(str: string): string {
  let out = "";
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      out += ch;
    } else if (cp <= 0xffff) {
      out += "\\u" + cp.toString(16).padStart(4, "0");
    } else {
      const v = cp - 0x10000;
      const hi = 0xd800 + (v >> 10);
      const lo = 0xdc00 + (v & 0x3ff);
      out +=
        "\\u" +
        hi.toString(16).padStart(4, "0") +
        "\\u" +
        lo.toString(16).padStart(4, "0");
    }
  }
  return out;
}

/** Equivalent of Python's `json.dumps(obj, ensure_ascii=True)` for the dict/array payloads the SDK serialises. */
function pythonJsonDumps(obj: unknown): string {
  return escapeNonAscii(JSON.stringify(obj));
}

describe("multilingual full-text search (issue #11538)", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  const suiteStartMs = Date.now();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: "seed-org-id",
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: { excludeClickhouseRead: false, templateFlag: true },
      admin: true,
    },
    environment: {} as any,
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  /** Insert a trace whose `input`/`output` are stored in the Python-SDK escaped form. */
  async function insertEscapedTrace(opts: {
    name: string;
    input?: unknown;
    output?: unknown;
  }) {
    const trace = createTrace({
      id: randomUUID(),
      project_id: projectId,
      name: opts.name,
      timestamp: Date.now(),
      input: opts.input !== undefined ? pythonJsonDumps(opts.input) : undefined,
      output:
        opts.output !== undefined ? pythonJsonDumps(opts.output) : undefined,
    });
    await createTracesCh([trace]);
    return trace;
  }

  async function searchTraceIds(
    searchQuery: string,
    searchType: TracingSearchType[],
  ): Promise<string[]> {
    const res = await caller.traces.all({
      projectId,
      filter: [
        {
          column: "timestamp",
          type: "datetime",
          operator: ">=",
          value: new Date(suiteStartMs - 60_000).toISOString(),
        },
      ],
      searchQuery,
      searchType,
      page: 0,
      limit: 100,
      orderBy: { column: "timestamp", order: "DESC" },
    });
    return res.traces.map((t) => t.id);
  }

  // -------------------------------------------------------------------------
  // 1. One integration test per writing system used by >= 1M people.
  //    (Separate Simplified vs. Traditional Chinese, separate Hiragana vs. Katakana.)
  // -------------------------------------------------------------------------
  const SCRIPTS: { script: string; sample: string }[] = [
    // Latin — exercised via diacritics, which ARE non-ASCII and therefore get \u-escaped
    // (German/French/Vietnamese/Turkish/Spanish/… all rely on these).
    { script: "Latin (with diacritics)", sample: "Schöne Grüße aus München" },
    // Han / CJK ideographs — separate samples for Simplified and Traditional.
    {
      script: "Chinese — Simplified Hanzi",
      sample: "你好世界，今天我能帮你什么",
    },
    { script: "Chinese — Traditional Hanzi", sample: "歡迎使用繁體中文測試" },
    { script: "Arabic", sample: "مرحبا بالعالم، كيف يمكنني مساعدتك اليوم" },
    {
      script: "Devanagari (Hindi)",
      sample: "नमस्ते दुनिया, मैं आपकी कैसे मदद कर सकता हूँ",
    },
    {
      script: "Bengali-Assamese",
      sample: "নমস্কার বিশ্ব, আমি আপনাকে কীভাবে সাহায্য করতে পারি",
    },
    {
      script: "Cyrillic (Russian)",
      sample: "Привет мир, чем я могу вам помочь",
    },
    {
      script: "Japanese Kana — Hiragana",
      sample: "こんにちは、きょうはなにをおてつだいできますか",
    },
    {
      script: "Japanese Kana — Katakana",
      sample: "コンニチハ、コンピュータテスト",
    },
    {
      script: "Hangul (Korean)",
      sample: "안녕하세요 세계, 무엇을 도와드릴까요",
    },
    {
      script: "Telugu",
      sample: "నమస్కారం ప్రపంచం, నేను మీకు ఎలా సహాయం చేయగలను",
    },
    {
      script: "Tamil",
      sample: "வணக்கம் உலகம், நான் உங்களுக்கு எப்படி உதவ முடியும்",
    },
    {
      script: "Gujarati",
      sample: "નમસ્તે વિશ્વ, હું તમારી કેવી રીતે મદદ કરી શકું",
    },
    {
      script: "Kannada",
      sample: "ನಮಸ್ಕಾರ ಪ್ರಪಂಚ, ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು",
    },
    {
      script: "Burmese (Myanmar)",
      sample: "မင်္ဂလာပါ ကမ္ဘာ၊ ကျွန်တော် ဘယ်လို ကူညီပေးရမလဲ",
    },
    {
      script: "Malayalam",
      sample: "നമസ്കാരം ലോകം, എനിക്ക് നിങ്ങളെ എങ്ങനെ സഹായിക്കാം",
    },
    { script: "Thai", sample: "สวัสดีชาวโลก วันนี้ฉันช่วยอะไรคุณได้บ้าง" },
    { script: "Sundanese (Aksara Sunda)", sample: "ᮞ᮪ᮕᮤᮊᮤ ᮃᮊ᮪ᮞᮛ ᮞᮥᮔ᮪ᮓ" },
    {
      script: "Gurmukhi (Punjabi)",
      sample: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਦੁਨੀਆ, ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ",
    },
    { script: "Lao", sample: "ສະບາຍດີ ໂລກ, ມື້ນີ້ຂ້ອຍຊ່ວຍຫຍັງເຈົ້າໄດ້ແດ່" },
    {
      script: "Odia (Oriya)",
      sample: "ନମସ୍କାର ବିଶ୍ୱ, ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି",
    },
    {
      script: "Ge'ez / Ethiopic (Amharic)",
      sample: "ሰላም ዓለም፣ ዛሬ እንዴት ልረዳዎት እችላለሁ",
    },
    { script: "Sinhala", sample: "ආයුබෝවන් ලෝකය, මට ඔබට කෙසේ උදව් කළ හැකිද" },
    { script: "Hebrew", sample: "שלום עולם, איך אני יכול לעזור לך היום" },
    { script: "Armenian", sample: "Բարեւ աշխարհ, ինչպես կարող եմ օգնել ձեզ" },
    { script: "Khmer", sample: "សួស្ដី ពិភពលោក, តើខ្ញុំអាចជួយអ្នកដោយរបៀបណា" },
    {
      script: "Greek",
      sample: "Γεια σου κόσμε, πώς μπορώ να σε βοηθήσω σήμερα",
    },
    { script: "Lontara (Buginese)", sample: "ᨈᨅᨙ ᨒᨚᨈᨑ ᨅᨘᨁᨗ" },
    {
      script: "Tibetan",
      sample: "བཀྲ་ཤིས་བདེ་ལེགས། ཁྱེད་རང་ལ་རོགས་རམ་ག་འདྲ་བྱེད་དགོས",
    },
    {
      script: "Georgian",
      sample: "გამარჯობა მსოფლიო, როგორ შემიძლია დაგეხმაროთ",
    },
    { script: "Modern Yi (Nuosu)", sample: "ꆈꌠꉙ ꇩꆈꌠ ꉛꐯ" },
    {
      script: "Mongolian (traditional script)",
      sample: "ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ ᠦᠨ ᠰᠣᠷᠢᠯᠲᠠ",
    },
    {
      script: "Tifinagh (Tamazight)",
      sample: "ⴰⵣⵓⵍ ⴰⵎⴰⴹⴰⵍ, ⵎⴰⵎⴽ ⵣⵎⵔⵖ ⴰⴷ ⴰⴽ ⵄⴰⵡⵏⵖ",
    },
  ];

  describe("returns the trace when searching its (escaped-on-disk) input text — Full Text: Input/Output", () => {
    it.each(SCRIPTS)("$script", async ({ script, sample }) => {
      const trace = await insertEscapedTrace({
        name: `ml-search-${script}-${randomUUID()}`,
        input: { message: sample },
      });
      const ids = await searchTraceIds(sample, ["id", "content"]);
      expect(ids).toContain(trace.id);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Edge cases (still integration-level, via the tRPC table API).
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    it("finds a trace whose Arabic text is only in `output` — Full Text: Output", async () => {
      const trace = await insertEscapedTrace({
        name: `ml-output-only-${randomUUID()}`,
        input: { note: "plain ascii input, nothing to see here" },
        output: { reply: "شكرا جزيلا، نتمنى لك يوما سعيدا" },
      });
      const ids = await searchTraceIds("نتمنى لك يوما سعيدا", ["id", "output"]);
      expect(ids).toContain(trace.id);
    });

    it("finds a trace whose Chinese text is only in `input` — Full Text: Input", async () => {
      const trace = await insertEscapedTrace({
        name: `ml-input-only-${randomUUID()}`,
        input: { prompt: "请把这段话翻译成英文" },
        output: { result: "plain ascii output without the keyword" },
      });
      const ids = await searchTraceIds("请把这段话翻译成英文", ["id", "input"]);
      expect(ids).toContain(trace.id);
    });

    it("Full Text: Input/Output matches whether the (escaped) Korean text is in input OR output", async () => {
      const phrase = "이건 입력과 출력 모두에서 찾을 수 있어야 합니다";
      const inInput = await insertEscapedTrace({
        name: `ml-content-in-input-${randomUUID()}`,
        input: { msg: phrase },
        output: { result: "ascii only" },
      });
      const inOutput = await insertEscapedTrace({
        name: `ml-content-in-output-${randomUUID()}`,
        input: { msg: "ascii only" },
        output: { reply: phrase },
      });
      const ids = await searchTraceIds(phrase, ["id", "content"]);
      expect(ids).toEqual(expect.arrayContaining([inInput.id, inOutput.id]));
    });

    it("finds a trace via a mixed Latin + CJK query (the bytes preceding the non-ASCII run still match)", async () => {
      const trace = await insertEscapedTrace({
        name: `ml-mixed-${randomUUID()}`,
        input: { event: "Order confirmed 订单已确认 — thank you" },
      });
      // search the non-ASCII run on its own ...
      expect(await searchTraceIds("订单已确认", ["id", "content"])).toContain(
        trace.id,
      );
      // ... and the full mixed string ("Order confirmed " is ASCII and stays verbatim in the
      //     stored value, the CJK run is \u-escaped — a correct fix matches the escaped form).
      expect(
        await searchTraceIds("Order confirmed 订单已确认", ["id", "content"]),
      ).toContain(trace.id);
    });

    it("finds a trace by an astral-plane character stored as a UTF-16 surrogate pair (emoji)", async () => {
      const trace = await insertEscapedTrace({
        name: `ml-emoji-${randomUUID()}`,
        input: { status: "Deployment 🚀 succeeded" },
      });
      // 🚀 (U+1F680) is persisted as the literal sequence \ud83d\ude80; a correct fix encodes the
      // query the same way.
      expect(await searchTraceIds("🚀", ["id", "content"])).toContain(trace.id);
    });

    it("finds a trace by a supplementary-plane CJK ideograph (CJK Ext. B)", async () => {
      const trace = await insertEscapedTrace({
        name: `ml-cjk-ext-b-${randomUUID()}`,
        // 𠀀 = U+20000, 𠀁 = U+20001 — both stored as surrogate pairs (\ud840\udc00, \ud840\udc01).
        input: { rareChars: "古文字 𠀀𠀁 测试" },
      });
      expect(await searchTraceIds("𠀀𠀁", ["id", "content"])).toContain(
        trace.id,
      );
    });

    it("reproduces the exact issue #11538 scenario: a trace with {en, ar, zh} input is findable by the Arabic and Chinese text", async () => {
      // This is byte-for-byte what the OpenTelemetry pipeline lands in ClickHouse for the
      // reporter's snippet (`span.update(input={"en": ..., "ar": ..., "zh": ...})`).
      const trace = await insertEscapedTrace({
        name: `issue-11538-${randomUUID()}`,
        input: {
          en: "Hello, how can I help you today?",
          ar: "مرحبا، كيف يمكنني مساعدتك اليوم؟",
          zh: "你好，今天我能帮你什么？",
        },
        output: { response: "Test response" },
      });
      // The reporter says "Hello" finds it (ASCII works) but "مرحبا" / "你好" do not.
      expect(await searchTraceIds("مرحبا", ["id", "content"])).toContain(
        trace.id,
      );
      expect(await searchTraceIds("你好", ["id", "content"])).toContain(
        trace.id,
      );
      expect(await searchTraceIds("مساعدتك", ["id", "content"])).toContain(
        trace.id,
      );
    });

    it("reproduces issue #11538 through the real ingestion pipeline (POST /api/public/ingestion → worker → ClickHouse)", async () => {
      const traceId = randomUUID();
      // The Langfuse Python SDK serialises I/O to a JSON *string* (with ensure_ascii=True) before
      // putting it on the OTel span attribute, so the value arriving here is already escaped.
      const input = pythonJsonDumps({
        en: "Hello, how can I help you today?",
        ar: "مرحبا، كيف يمكنني مساعدتك اليوم؟",
        zh: "你好，今天我能帮你什么？",
      });
      const res = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [
          {
            id: randomUUID(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "multilingual-test-ingested",
              timestamp: new Date().toISOString(),
              input,
              output: pythonJsonDumps({ response: "Test response" }),
            },
          },
        ],
      });
      expect(res.status).toBe(207);
      // wait for the worker (running as part of `pnpm run dev`) to flush it
      await waitForExpect(async () => {
        const t = await getTraceById({
          traceId,
          projectId,
          clickHouseQueryTags: directTrpcClickHouseQueryTags,
        });
        expect(t).toBeDefined();
      }, 45_000);
      expect(await searchTraceIds("你好", ["id", "content"])).toContain(
        traceId,
      );
      expect(await searchTraceIds("مساعدتك", ["id", "content"])).toContain(
        traceId,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Observations (the same bug lives in the observations / generations table).
  // -------------------------------------------------------------------------
  describe("observations", () => {
    it("finds a generation whose escaped Hangul input matches a raw search — generations.all", async () => {
      const traceId = randomUUID();
      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
          name: `ml-obs-trace-${randomUUID()}`,
          timestamp: Date.now(),
        }),
      ]);
      const obsId = randomUUID();
      const sample = "이 생성 결과를 한국어로 검색할 수 있어야 합니다";
      await createObservationsCh([
        createObservation({
          id: obsId,
          project_id: projectId,
          trace_id: traceId,
          type: "GENERATION",
          name: `ml-obs-${randomUUID()}`,
          start_time: Date.now(),
          input: pythonJsonDumps({ prompt: sample }),
          output: pythonJsonDumps({ completion: "ascii only" }),
        }),
      ]);
      const generations = await caller.generations.all({
        projectId,
        searchQuery: sample,
        searchType: ["id", "content"],
        filter: [],
        orderBy: null,
        limit: 100,
        page: 0,
      });
      expect(
        generations.generations.map((g: { id: string }) => g.id),
      ).toContain(obsId);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Unit — the SQL builder itself (light, per the Testing Trophy).
  //    `clickhouseSearchCondition` must, for a non-ASCII query, also bind the JSON-\u-escaped
  //    form so it can match content written by `ensure_ascii=True` serialisers.
  // -------------------------------------------------------------------------
  describe("clickhouseSearchCondition — escaped-form parameter", () => {
    const paramValues = (q: string, t: TracingSearchType[]) =>
      Object.values(
        clickhouseSearchCondition({
          query: q,
          searchType: t,
          tablePrefix: "t",
        }).params as Record<string, string>,
      );

    it("binds the \\u-escaped form of a CJK query in addition to the raw form (content search)", () => {
      const result = clickhouseSearchCondition({
        query: "你好",
        searchType: ["content"],
        tablePrefix: "t",
      });
      const values = Object.values(result.params as Record<string, string>);
      // the raw form is already bound today; the JSON-\u-escaped form is what's missing
      expect(values).toContain("%你好%");
      expect(values).toContain("%\\u4f60\\u597d%"); // 你 = U+4F60, 好 = U+597D
      // ... and the generated WHERE clause must apply that escaped parameter to input AND output
      expect(result.query).toMatch(
        /t\.input ILIKE \{[^}]+: String\}.*t\.output ILIKE/s,
      );
      expect(
        result.query.match(/t\.input ILIKE/g)?.length ?? 0,
      ).toBeGreaterThanOrEqual(2);
    });

    it("binds the \\u-escaped form of an Arabic query (input search)", () => {
      // مرحبا = U+0645 U+0631 U+062D U+0628 U+0627
      expect(paramValues("مرحبا", ["input"])).toContain(
        "%\\u0645\\u0631\\u062d\\u0628\\u0627%",
      );
    });

    it("encodes an astral-plane (emoji) query as a UTF-16 surrogate pair, like a JSON serializer would", () => {
      // 🚀 = U+1F680 -> UTF-16 surrogate pair D83D DE80
      expect(paramValues("🚀", ["content"])).toContain("%\\ud83d\\ude80%");
    });
  });
});
