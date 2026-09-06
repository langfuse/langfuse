// @vitest-environment node

import { createTranslator } from "next-intl";

import { getMessages } from "@/src/features/i18n/messages";
import {
  localizeCompletionDetail,
  localizeCompletionSection,
  localizeDiagnostic,
  localizeTokenExplanation,
  type SearchBarTranslator,
} from "@/src/features/search-bar/lib/localization";

const t = createTranslator({
  locale: "zh-CN",
  messages: getMessages("zh-CN"),
  namespace: "sharedUi.searchBar",
});
const translate: SearchBarTranslator = (key, values) =>
  t(key as never, values as never);

const diagnostic = (message: string) =>
  localizeDiagnostic(
    { from: 0, to: message.length, severity: "error", message },
    translate,
  ).message;

describe("search bar localization", () => {
  it("localizes parser and length diagnostics with dynamic values", () => {
    expect(diagnostic('Unknown field "foo"')).toBe("未知字段“foo”");
    expect(diagnostic("Query is too long (201 chars, max 200)")).toBe(
      "查询过长（当前 201 个字符，最多 200 个）",
    );
    expect(
      diagnostic(
        '"or" between filters is not supported yet — combine one field\'s values with field:(A OR B), or quote "or" to search text',
      ),
    ).toBe(
      "暂不支持在筛选条件之间使用“or”；请用 field:(A OR B) 组合同一字段的值，或为“or”加引号以按文本搜索",
    );
  });

  it("localizes field, grouping, metadata, and score contract diagnostics", () => {
    expect(
      diagnostic(
        'AND grouping (all of) only applies to array fields like traceTags — "level" is not an array',
      ),
    ).toBe(
      "AND 分组（全部包含）仅适用于 traceTags 等数组字段；“level”不是数组",
    );
    expect(
      diagnostic(
        '"latency" is a number field and does not support contains (*term*)',
      ),
    ).toBe("“latency”是数值字段，不支持包含匹配（*term*）");
    expect(
      diagnostic(
        "negated equality on metadata is not representable — use -metadata.region:*value* (does not contain)",
      ),
    ).toBe(
      "无法表示元数据的否定等值筛选；请使用 -metadata.region:*value*（不包含）",
    );
    expect(
      diagnostic(
        "negated numeric score equality is not representable — use comparisons (scores.accuracy:<n or scores.accuracy:>n)",
      ),
    ).toBe(
      "无法表示数值评分的否定等值筛选；请使用比较表达式（scores.accuracy:<n 或 scores.accuracy:>n）",
    );
    expect(
      diagnostic(
        "scores.flag expects a single boolean value — grouped boolean values are not supported",
      ),
    ).toBe("scores.flag 仅接受一个布尔值，不支持布尔值分组");
  });

  it("localizes completion sections and every score-type combination", () => {
    expect(localizeCompletionSection("Observed values", translate)).toBe(
      "已观测值",
    );
    expect(
      localizeCompletionDetail(
        {
          id: "score:quality",
          kind: "field",
          label: "scores.quality",
          fieldId: "scores.quality",
          detail: "categorical score + boolean score",
        },
        translate,
      ),
    ).toBe("分类和布尔评分");
    expect(
      localizeCompletionDetail(
        {
          id: "metadata:region",
          kind: "field",
          label: "metadata.region",
          fieldId: "metadata.region",
          detail: "string",
        },
        translate,
      ),
    ).toBe("字符串");
  });

  it("localizes values and conjunctions in token explanations", () => {
    expect(
      localizeTokenExplanation(
        {
          subject: "Latency",
          predicate: "is above 2 seconds.",
        },
        translate,
      ),
    ).toEqual({ subject: "Latency", predicate: "大于 2 秒。" });
    expect(
      localizeTokenExplanation(
        {
          subject: "Name",
          predicate: 'is exactly "a" or "b".',
        },
        translate,
      ),
    ).toEqual({ subject: "Name", predicate: '精确等于 "a"或"b"。' });
  });
});
