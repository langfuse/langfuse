import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnchorableLines,
  envelope,
  parseFingerprints,
  partitionFindings,
  summaryBullet,
} from "./partition-findings.mjs";

const headSha = "0f1e2d3c4b5a69788796a5b4c3d2e1f005040302";
const anchoredFile = "web/src/features/dashboards/WidgetForm.tsx";

// Only line 1 of `anchoredFile` is on the RIGHT side of a hunk, so every other
// line is off-diff.
const anchorableLines = buildAnchorableLines([
  { filename: anchoredFile, patch: "@@ -1,2 +1,3 @@\n+const a = 1;\n" },
]);

const gap = {
  userAction: "Saves a widget",
  question: "How often do users save widgets?",
  proposedEvent: "dashboard:widget_saved",
  registryEdit: '"widget_saved",',
  proposedProps: ["widgetType"],
  keyDimension: "isV4",
  feature: "dashboards",
  confidence: "high",
  anchor: { file: anchoredFile, line: 1 },
  suggestedCaptureSite: { file: anchoredFile, symbol: "onSave" },
};

const violation = {
  rule: "privacy",
  problem: "The capture forwards the raw widget name.",
  fix: "Send the name length instead.",
  suggestion: "",
  feature: "dashboards",
  confidence: "high",
  anchor: { file: anchoredFile, line: 12 },
};

function run({ output, seenFingerprints = new Set() }) {
  return partitionFindings({
    output,
    anchorableLines,
    seenFingerprints,
    maxInlineComments: 3,
  });
}

/** Mirrors the envelope the workflow's `gapBody` puts on an inline comment. */
function inlineComment(finding) {
  return envelope({
    fp: finding.fp,
    event: finding.source.proposedEvent,
    conf: finding.confidence,
    cls: finding.cls,
    feat: finding.source.feature,
    sha: headSha,
  });
}

test("a withheld finding is not reported again on the next run", () => {
  const output = {
    verdict: "findings",
    introducedGaps: [
      gap,
      {
        ...gap,
        confidence: "low",
        proposedEvent: "dashboard:widget_previewed",
        suggestedCaptureSite: { file: anchoredFile, symbol: "onPreview" },
      },
    ],
    ruleViolations: [],
  };

  const first = run({ output });
  assert.equal(first.inline.length, 1);
  assert.equal(first.lowerConfidence.length, 1);

  const summaryText = first.lowerConfidence
    .map((finding) => summaryBullet(finding, headSha))
    .join("\n");

  assert.deepEqual(
    parseFingerprints(summaryText).fingerprints,
    first.lowerConfidence.map((finding) => finding.fp),
    "summary bullets must carry the fingerprints of the findings they withhold",
  );

  // Seed run 2 from what run 1 actually persisted: the inline comment bodies
  // plus the review summary.
  const { fingerprints } = parseFingerprints(
    [...first.inline.map(inlineComment), summaryText].join("\n\n"),
  );
  const second = run({ output, seenFingerprints: new Set(fingerprints) });

  assert.deepEqual(second.lowerConfidence, []);
  assert.equal(second.fresh.length, 0);
});

test("an off-diff violation keeps its fingerprint when its line moves", () => {
  const fingerprintAtLine = (line) =>
    run({
      output: {
        verdict: "findings",
        introducedGaps: [],
        ruleViolations: [{ ...violation, anchor: { file: anchoredFile, line } }],
      },
    }).offDiff[0].fp;

  assert.equal(fingerprintAtLine(12), fingerprintAtLine(40));
});

test("an inline finding is deduped from its existing review comment", () => {
  const output = {
    verdict: "findings",
    introducedGaps: [gap],
    ruleViolations: [],
  };

  const first = run({ output });
  const { fingerprints } = parseFingerprints(
    first.inline.map(inlineComment).join("\n\n"),
  );
  const second = run({ output, seenFingerprints: new Set(fingerprints) });

  assert.deepEqual(second.inline, []);
  assert.equal(second.fresh.length, 0);
});
