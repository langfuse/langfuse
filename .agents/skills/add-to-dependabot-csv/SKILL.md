---
name: add-to-dependabot-csv
description: Append GitHub Dependabot or Snyk/code-scanning alerts to an existing vulnerability CSV after verifying their API metadata. Use for "add to Dependabot CSV" or "dismissed it, add it to the list".
---

# Add to Dependabot CSV

Update the local tracker only. Read GitHub; do not dismiss alerts, change dependencies,
or commit files as part of this workflow.

## 1. Locate and inspect

Use the requested CSV. Otherwise look for `Dependabot List - CLEAN CURRENT.csv`
in the working checkout. If absent or ambiguous, ask for the path; do not create
or replace a tracker silently.

Read its header and a few recent rows, including a dismissed row. Preserve column
order, CSV quoting, encoding, line endings, and timestamp conventions. Snapshot
original bytes before writing. Match fields by header, not column position.

Deduplicate against both existing rows and the requested batch using the canonical
GitHub `html_url` (ignore input query strings, fragments, and trailing slashes).
Alert numbers and CVEs alone are not unique: Dependabot and code scanning have
separate number spaces, and one CVE can have multiple image alerts. Skip an
existing URL and report it; updating old rows requires an explicit request.

## 2. Verify GitHub metadata

Take owner, repository, alert type, and number from each supplied URL. For a bare
number, resolve the alert type from context or ask; never guess the endpoint.

```sh
gh api 'repos/OWNER/REPO/dependabot/alerts/NUMBER'
gh api 'repos/OWNER/REPO/code-scanning/alerts/NUMBER'
gh api 'advisories?cve_id=CVE-YYYY-NNNNN'
gh api 'advisories/GHSA-XXXX-XXXX-XXXX'
```

Fetch each distinct requested alert. Reuse embedded Dependabot advisory metadata;
for code scanning, query a referenced GHSA or CVE once and match the package and
ecosystem, rather than taking the first result. If there is no advisory ID, retain
the scanner's available metadata and leave unsupported advisory fields blank.
If the user says they dismissed it, verify `state`, `dismissed_at`,
`dismissed_reason`, and `dismissed_comment`. Preserve GitHub's exact reason and
comment, including punctuation. Report discrepancies with the user's account;
do not silently record an unverified dismissal. If API access fails, stop before
appending those rows and state what could not be verified.

## 3. Map to the existing columns

- Copy repository, alert number, URL, state, lifecycle timestamps, and dismissal
  fields from the alert. Keep actual code-scanning URLs even in a Dependabot CSV.
- For Dependabot, use `dependency`, `security_advisory`, and
  `security_vulnerability` for package, scope, advisory, and affected/fixed versions.
- For code scanning, use `rule.full_description`, `rule.description`,
  `rule.security_severity_level`, `rule.tags`, and `rule.help`. Resolve CVSS,
  advisory dates, references, and package-specific affected/fixed versions from
  the matching GitHub advisory. Use scanner guidance when GitHub has no package
  range; include that source in `advisory_references`.
- Keep similarly named packages separate (`deepmerge` versus `deepmerge-ts`).
  Do not apply another package's version range or confuse detection dates with
  advisory publication dates. Leave unavailable fields blank; do not invent
  classification, dependency scope, scores, or history.
- Copy the dismissal comment into `dismissed_comment_or_delay_reasoning` when
  that matches the existing convention. Use the user's supplied delay reasoning
  for an open alert only when explicitly provided.
- Keep API timestamps in their existing UTC format. This tracker uses
  `Europe/Berlin` with an explicit offset for `dismissed_at_web_ui` and
  `state_list_timestamps`; use timezone-aware conversion, including DST.
- Keep `dismissed_at` as the current API value. This tracker's historical columns
  use the earliest dismissal for `dismissed_at_web_ui` and `dismissed_reason`,
  and the first non-empty dismissal comment for both comment columns. For an
  alert just dismissed with no evidence of earlier transitions, use the current
  API dismissal; do not require a timeline visit to prove no earlier event exists.
- Pair known state transitions with their event timestamps: creation and current
  dismissal yield `open|dismissed`; creation and fix yield `open|fixed`. Inspect
  the authenticated timeline when there is evidence of earlier dismissals or
  reopenings, or a later fix cleared known dismissal fields. If that history is
  unavailable, preserve known events, leave only unverified historical fields
  blank, and report the gap. Never claim an incomplete history is exhaustive.
- Match existing separators: `; ` for CWEs, ` | ` for advisory references, and
  `|` for state history and corresponding timestamps.

## 4. Append and verify

Serialize new rows with a CSV-aware writer and append only. Preserve timestamp
strings exactly; spreadsheet tooling may coerce ISO strings into dates and lose
the original offset. Check that the file still matches the snapshot immediately
before writing. Preserve every original byte, adding a separator newline if needed.

Reparse the saved CSV and verify:

- Original bytes remain an exact prefix; original rows and header are unchanged.
- Record count increases by the number of new, unique alert URLs.
- Every row has the header's column count; new URLs occur exactly once.
- New fields match their sources: current API state, verified historical
  dismissal events when applicable, and any explicit user delay reasoning.
  State timestamps align with their states.

Finish with a short, valid Markdown file link, added/skipped alert numbers, final
record/column counts, and confirmation that existing content is unchanged. Mention
any unavailable metadata. No application tests are needed for this CSV-only edit.
