/**
 * Pure decision logic for the PostHog instrumentation review bot (LFE-15012).
 *
 * The `Post review` step of `.github/workflows/posthog-instrumentation-review.yml`
 * keeps the long agent-prompt rendering and every Octokit call inline; the
 * partitioning, fingerprinting, and envelope handling live here so they are
 * testable with `node --test`.
 */
import crypto from "node:crypto";

const envelopeMarker = "posthog-review:v1";
const envelopePattern = new RegExp(
  `<!-- ${envelopeMarker} (\\{.*?\\}) -->`,
  "gs",
);

/**
 * Splits the agent's findings into the buckets the review body reports.
 *
 * `inline` is posted as review comments; the rest are summary bullets. A
 * finding already carrying a fingerprint in `seenFingerprints` is dropped, so a
 * finding resolved on an earlier run is not re-posted.
 */
export function partitionFindings({
  output,
  anchorableLines,
  seenFingerprints,
  maxInlineComments,
}) {
  const optedOut = output.verdict === "opted_out";

  // A rule violation has no capture site to key on, so it keys on the text of
  // the anchored line: unique per line, and it travels with the code across a
  // rebase the way a line number does not. Off-diff anchors have no line text,
  // and falling back to the line number would mint a new fingerprint on every
  // push that shifts it, so they key on the reported problem instead.
  const anchorText = (violation) =>
    anchorableLines.get(violation.anchor.file)?.get(violation.anchor.line) ??
    safe(violation.problem);

  const findings = [
    ...(optedOut ? [] : (output.introducedGaps ?? [])).map((gap) => ({
      cls: "gap",
      confidence: gap.confidence,
      anchor: gap.anchor,
      label: `\`${safe(gap.proposedEvent)}\` — ${safe(gap.userAction)}`,
      fp: fingerprint(
        gap.suggestedCaptureSite.file,
        gap.suggestedCaptureSite.symbol,
        gap.proposedEvent,
      ),
      source: gap,
    })),
    ...(output.ruleViolations ?? []).map((violation) => ({
      cls: "rule",
      confidence: violation.confidence,
      anchor: violation.anchor,
      label: `\`${violation.rule}\` — ${safe(violation.problem)}`,
      fp: fingerprint(
        violation.anchor.file,
        violation.rule,
        anchorText(violation),
      ),
      source: violation,
    })),
  ].map((finding) => ({
    ...finding,
    source: { ...finding.source, fp: finding.fp },
  }));

  const fresh = findings.filter((finding) => !seenFingerprints.has(finding.fp));
  const anchorable = (finding) =>
    anchorableLines.get(finding.anchor.file)?.has(finding.anchor.line) ?? false;
  const inlineCandidates = fresh.filter(
    (finding) => finding.confidence === "high" && anchorable(finding),
  );

  return {
    findings,
    fresh,
    inline: inlineCandidates.slice(0, maxInlineComments),
    cappedOut: inlineCandidates.slice(maxInlineComments),
    offDiff: fresh.filter(
      (finding) => finding.confidence === "high" && !anchorable(finding),
    ),
    lowerConfidence: fresh.filter((finding) => finding.confidence !== "high"),
  };
}

/**
 * Maps every changed file to the lines a review comment may anchor to.
 *
 * Only lines on the RIGHT side of a diff hunk are valid anchors, and one bad
 * anchor rejects the whole review. Each line's text is kept as a rebase-stable
 * fingerprint input.
 */
export function buildAnchorableLines(files) {
  const anchorableLines = new Map();
  for (const file of files) {
    if (!file.patch) continue;
    const lines = new Map();
    let cursor = 0;
    for (const patchLine of file.patch.split("\n")) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(patchLine);
      if (hunk) {
        cursor = Number(hunk[1]);
        continue;
      }
      if (patchLine.startsWith("+") || patchLine.startsWith(" ")) {
        lines.set(cursor, patchLine.slice(1).trim());
        cursor += 1;
      } else if (patchLine.startsWith("\\")) {
        continue;
      }
    }
    anchorableLines.set(file.filename, lines);
  }
  return anchorableLines;
}

/**
 * Reads every envelope in `text`, returning its fingerprints and how many
 * envelopes were malformed.
 *
 * One body can carry many envelopes — a review summary appends one per bullet —
 * so all matches are scanned rather than only the first.
 */
export function parseFingerprints(text) {
  const fingerprints = [];
  let unparseable = 0;
  for (const match of String(text ?? "").matchAll(envelopePattern)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.fp) fingerprints.push(parsed.fp);
    } catch {
      unparseable += 1;
    }
  }
  return { fingerprints, unparseable };
}

/**
 * Collects the fingerprints the bot itself has already posted.
 *
 * Only `botLogin`'s own bodies are read: an envelope suppresses a later finding,
 * so anyone able to comment could otherwise paste one to silence the bot.
 */
export function seenFingerprintsFrom(records, botLogin) {
  const seen = new Set();
  let unparseable = 0;
  for (const record of records) {
    if (record.user?.login !== botLogin) continue;
    const parsed = parseFingerprints(record.body);
    for (const fp of parsed.fingerprints) seen.add(fp);
    unparseable += parsed.unparseable;
  }
  return { seen, unparseable };
}

/**
 * Strips HTML comment markers from a suggestion, preserving its line breaks.
 *
 * A suggestion renders raw inside a fenced block, so unlike `safe()` it keeps
 * newlines — but an injected envelope would be read back as a fingerprint.
 */
export function safeSuggestion(value) {
  return String(value ?? "")
    .replace(/-->/g, "-- >")
    .replace(/<!--/g, "< !--");
}

/** Renders a finding as one bullet in the review body. */
export function bullet(finding) {
  return `- \`${finding.anchor.file}:${finding.anchor.line}\` — ${finding.label} (${finding.confidence})`;
}

/**
 * Renders a withheld finding as a bullet carrying its fingerprint envelope.
 *
 * A withheld finding is never posted as an inline comment, so the review body
 * is the only place its fingerprint can be persisted; without it the next run
 * reads no fingerprint back and reports the same finding again.
 */
export function summaryBullet(finding, headSha) {
  const fields = {
    fp: finding.fp,
    conf: finding.confidence,
    cls: finding.cls,
    feat: safe(finding.source.feature),
    sha: headSha,
  };
  if (finding.cls === "gap") {
    fields.event = safe(finding.source.proposedEvent);
  } else {
    fields.rule = finding.source.rule;
  }
  return `${bullet(finding)} ${envelope(fields)}`;
}

/**
 * Strips sequences that would terminate the machine envelope or one of our own
 * fenced blocks early.
 */
export function safe(value) {
  return String(value ?? "")
    .replace(/-->/g, "-- >")
    .replace(/```/g, "'''")
    .replace(/\r?\n/g, " ")
    .trim();
}

/** Identity of a finding: a short sha1 over its keying triple. */
export function fingerprint(path, symbol, event) {
  return crypto
    .createHash("sha1")
    .update(`${path}|${symbol}|${event}`)
    .digest("hex")
    .slice(0, 16);
}

/** Renders the machine envelope a later run reads fingerprints back from. */
export function envelope(fields) {
  return `<!-- ${envelopeMarker} ${JSON.stringify(fields)} -->`;
}
