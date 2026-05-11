#!/usr/bin/env python3
"""Scan Langfuse workspace commits for weekly changelog candidates."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


VISIBLE_KEYWORDS = {
    "api",
    "annotation",
    "auth",
    "billing",
    "blob",
    "clickhouse",
    "cli",
    "cloud",
    "comment",
    "dataset",
    "deploy",
    "docs",
    "eval",
    "export",
    "integration",
    "mcp",
    "media",
    "metric",
    "model",
    "openai",
    "otel",
    "playground",
    "prompt",
    "public",
    "region",
    "release",
    "score",
    "sdk",
    "self-host",
    "session",
    "trace",
    "tracing",
}

INTERNAL_TYPES = {"build", "chore", "ci", "refactor", "style", "test"}
VISIBLE_TYPES = {"feat", "fix", "perf", "security", "docs"}


@dataclass
class Repo:
    name: str
    path: Path
    url: str


@dataclass
class Commit:
    repo: str
    short: str
    sha: str
    date: str
    author: str
    subject: str
    priority: str
    reason: str


def run(cmd: list[str], cwd: Path) -> str:
    return subprocess.check_output(cmd, cwd=cwd, text=True, stderr=subprocess.DEVNULL)


def previous_completed_iso_week(
    now: dt.datetime | None = None,
) -> tuple[dt.datetime, dt.datetime]:
    now = now or dt.datetime.now().astimezone()
    current_monday = (now - dt.timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return current_monday - dt.timedelta(days=7), current_monday


def parse_date(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.astimezone()
    return parsed


def detect_platform_root(start: Path) -> Path:
    for candidate in [start, *start.parents]:
        repos_file = candidate / "config" / "repos.tsv"
        if repos_file.exists():
            return candidate
    return start


def read_repos(root: Path, include_platform: bool) -> list[Repo]:
    repos: list[Repo] = []
    repos_file = root / "config" / "repos.tsv"
    if not repos_file.exists():
        raise FileNotFoundError(
            f"Missing repo map at {repos_file}. Run this from the platform workspace root "
            "or pass --root to that workspace."
        )
    if include_platform:
        repos.append(Repo("platform", root, ""))
    with repos_file.open(newline="") as handle:
        reader = csv.reader(handle, delimiter="\t")
        for row in reader:
            if not row or row[0].startswith("#"):
                continue
            name, rel_path, url = row
            repos.append(Repo(name, root / rel_path, url))
    return repos


CONVENTIONAL_RE = re.compile(
    r"^(?P<type>[a-z]+)(?:\([^)]+\))?(?P<breaking>!)?:\s*(?P<body>.+)$"
)


def classify(repo: str, subject: str) -> tuple[str, str]:
    lower = subject.lower()
    match = CONVENTIONAL_RE.match(lower)
    commit_type = match.group("type") if match else ""
    breaking = bool(match and match.group("breaking"))
    keyword_hits = sorted(keyword for keyword in VISIBLE_KEYWORDS if keyword in lower)

    if breaking:
        return "high", "breaking-change marker"
    if commit_type == "feat":
        return "high", "feature commit"
    if commit_type in {"security", "perf"} and keyword_hits:
        return "high", f"{commit_type} with visible keywords: {', '.join(keyword_hits[:4])}"
    if repo in {"cli", "js-sdk", "python-sdk", "docs"} and commit_type in {
        "fix",
        "docs",
    }:
        return "high", f"{repo} public surface change"
    if commit_type in VISIBLE_TYPES and keyword_hits:
        return "medium", f"{commit_type} with visible keywords: {', '.join(keyword_hits[:4])}"
    if keyword_hits and commit_type not in INTERNAL_TYPES:
        return "medium", f"visible keywords: {', '.join(keyword_hits[:4])}"
    return "low", "likely internal"


def scan_repo(repo: Repo, since: dt.datetime, until: dt.datetime) -> tuple[list[Commit], int, str | None]:
    if not repo.path.exists():
        return [], 0, "missing"
    try:
        run(["git", "rev-parse", "--is-inside-work-tree"], repo.path)
    except subprocess.CalledProcessError:
        return [], 0, "not a git checkout"

    fmt = "%H%x1f%h%x1f%ad%x1f%ae%x1f%s%x1e"
    try:
        raw = run(
            [
                "git",
                "log",
                f"--since={since.isoformat()}",
                f"--until={until.isoformat()}",
                f"--format={fmt}",
                "--date=short",
            ],
            repo.path,
        )
    except subprocess.CalledProcessError as exc:
        return [], 0, f"git log failed: {exc}"

    commits: list[Commit] = []
    total = 0
    for record in raw.strip("\x1e\n").split("\x1e"):
        if not record.strip():
            continue
        parts = record.strip().split("\x1f")
        if len(parts) != 5:
            continue
        sha, short, date, author, subject = parts
        total += 1
        priority, reason = classify(repo.name, subject)
        if priority in {"high", "medium"}:
            commits.append(
                Commit(repo.name, short, sha, date, author, subject, priority, reason)
            )
    return commits, total, None


def resolve_docs_repo(repos: list[Repo]) -> Repo | None:
    for repo in repos:
        if repo.url.rstrip("/").endswith("/langfuse/langfuse-docs.git"):
            return repo
    for repo in repos:
        if repo.name in {"docs", "langfuse-docs"}:
            return repo
    return None


def existing_changelogs(
    workspace_root: Path,
    docs_repo_root: Path,
    since: dt.datetime,
    until: dt.datetime,
) -> list[str]:
    changelog_dir = docs_repo_root / "content" / "changelog"
    if not changelog_dir.exists():
        return []
    entries: list[str] = []
    for path in sorted(changelog_dir.glob("*.mdx")):
        match = re.match(r"(\d{4}-\d{2}-\d{2})-", path.name)
        if not match:
            continue
        date = dt.datetime.fromisoformat(match.group(1)).replace(tzinfo=since.tzinfo)
        if since <= date < until:
            entries.append(str(path.relative_to(workspace_root)))
    return entries


def recommendation(candidates: list[Commit], changelogs: list[str]) -> tuple[str, str]:
    high = [commit for commit in candidates if commit.priority == "high"]
    medium = [commit for commit in candidates if commit.priority == "medium"]
    if high and changelogs:
        return "maybe", "high-priority candidates exist, but this week already has changelog files"
    if high:
        return "publish", "high-priority user-facing candidates found and no changelog file exists in the scanned week"
    if medium:
        return "maybe", "only medium-confidence candidates found"
    return "no", "no likely user-facing changelog candidates found"


def print_markdown(
    since: dt.datetime,
    until: dt.datetime,
    totals: dict[str, int],
    candidates: list[Commit],
    changelogs: list[str],
    errors: dict[str, str],
) -> None:
    decision, reason = recommendation(candidates, changelogs)
    print("# Weekly Changelog Scan\n")
    print(f"- Window: `{since.isoformat()}` to `{until.isoformat()}`")
    print(f"- Recommendation: **{decision}**")
    print(f"- Reason: {reason}")
    print(f"- Existing changelogs in window: {len(changelogs)}")
    print(f"- Candidate commits: {len(candidates)}")
    print()

    if changelogs:
        print("## Existing Changelogs")
        for path in changelogs:
            print(f"- `{path}`")
        print()

    if candidates:
        print("## Candidate Commits")
        for repo in sorted({commit.repo for commit in candidates}):
            print(f"### {repo}")
            for commit in [item for item in candidates if item.repo == repo]:
                print(
                    f"- `{commit.short}` {commit.date} [{commit.priority}] {commit.subject} "
                    f"({commit.reason})"
                )
            print()

    print("## Commit Totals")
    for repo, total in sorted(totals.items()):
        print(f"- {repo}: {total}")
    if errors:
        print()
        print("## Skipped Repos")
        for repo, error in sorted(errors.items()):
            print(f"- {repo}: {error}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Platform workspace root")
    parser.add_argument("--since", help="Inclusive ISO date/datetime")
    parser.add_argument("--until", help="Exclusive ISO date/datetime")
    parser.add_argument(
        "--include-platform", action="store_true", help="Also scan the umbrella repo"
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown")
    args = parser.parse_args()

    root = detect_platform_root(Path(args.root).expanduser().resolve())
    if args.since and args.until:
        since, until = parse_date(args.since), parse_date(args.until)
    elif args.since or args.until:
        parser.error("--since and --until must be provided together")
    else:
        since, until = previous_completed_iso_week()

    repos = read_repos(root, args.include_platform)
    candidates: list[Commit] = []
    totals: dict[str, int] = {}
    errors: dict[str, str] = {}

    for repo in repos:
        repo_candidates, total, error = scan_repo(repo, since, until)
        totals[repo.name] = total
        candidates.extend(repo_candidates)
        if error:
            errors[repo.name] = error

    candidates.sort(key=lambda item: (item.repo, item.date, item.short), reverse=True)
    docs_repo = resolve_docs_repo(repos)
    changelogs = (
        existing_changelogs(root, docs_repo.path, since, until) if docs_repo else []
    )

    if args.json:
        decision, reason = recommendation(candidates, changelogs)
        payload = {
            "window": {"since": since.isoformat(), "until": until.isoformat()},
            "recommendation": decision,
            "reason": reason,
            "existing_changelogs": changelogs,
            "candidates": [commit.__dict__ for commit in candidates],
            "totals": totals,
            "errors": errors,
        }
        print(json.dumps(payload, indent=2))
    else:
        print_markdown(since, until, totals, candidates, changelogs, errors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
