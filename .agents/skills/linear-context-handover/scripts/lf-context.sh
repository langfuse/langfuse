#!/usr/bin/env bash
#
# lf-context.sh — walk the context chain behind a piece of Langfuse work and
# print one readable brief.
#
#   file / sha  ->  commits  ->  PRs (squash subject "(#N)" or the commits API)
#               ->  branch names  ->  Linear ticket ids
#               ->  ticket, parent, subtickets, relations, project, AI handover
#
# Shipped with the `linear-context-handover` skill, which is the reading and
# writing practice around it; the planning practice is `linear-planning`.
# Provenance: LFE-15914 ("Agentic Coding and Linear: an RFC").
#
# Run it from inside the checkout you are about to change, or point it at one
# with --dir / $LANGFUSE_REPO.
#
#   lf-context.sh web/src/features/experiments/components/table/ExperimentsTable.tsx
#   lf-context.sh 65bbc753c
#   lf-context.sh 16912
#   lf-context.sh LFE-15711
#   lf-context.sh --help
#
# Read-only by design: git log / gh read APIs / a Linear GraphQL query. It never
# fetches, checks out, pushes, or mutates a ticket.
set -uo pipefail

# Which checkout to read history from, in order: --dir, $LANGFUSE_REPO, the
# checkout you are standing in. No machine-specific default — this ships to
# every engineer through the plugin.
APP_DEFAULT="${LANGFUSE_REPO:-$(git rev-parse --show-toplevel 2>/dev/null)}"
REPO_DEFAULT="${LANGFUSE_GH_REPO:-langfuse/langfuse}"
SLUG="${LINEAR_WORKSPACE:-clickhouse}"
KEYS="${LINEAR_KEYS:-lfe,lf}"

KIND=""
TARGET=""
REV=""
DIR=""
REPO=""
LIMIT=10
ONLINE=1

usage() {
  cat <<'EOF'
lf-context.sh — reconstruct the context behind Langfuse code, from git to Linear.

USAGE
  lf-context.sh <target> [options]

  <target> is auto-detected:
    a path      web/src/features/experiments/.../ExperimentsTable.tsx   (or an absolute path)
    a sha       65bbc753c            (7-40 hex chars, or anything git can rev-parse)
    a PR        16912  /  #16912     (all digits, <= 6)
    a ticket    LFE-15711            (<KEY>-<number>)

OPTIONS
  --path P | --sha S | --pr N | --ticket ID   skip auto-detection
  --dir PATH     git checkout to read history from (default: $LANGFUSE_REPO, or
                 the checkout the current directory is in)
  --repo O/R     GitHub repo for gh calls (default: langfuse/langfuse, or the
                 checkout's origin)
  --rev REF      revision to walk for a path (default: HEAD, or origin/<default>
                 when HEAD is behind it — a stale checkout otherwise hides the
                 newest PRs)
  --limit N      how many commits / PRs to follow (default 10)
  --offline      git only: no gh, no Linear
  -h, --help

WHAT IS AUTOMATIC AND WHAT NEEDS AN AGENT
  Automatic (git):   commits for a path, the commit itself, branches containing a
                     sha, PR numbers from squash-merge subjects "(#N)".
  Automatic (gh):    PR state / title / head+base branch / url / body, PRs
                     associated with a sha, the PRs whose branch carries a ticket
                     id. Needs `gh auth status` to be healthy.
  Automatic here:    ticket ids, from branch names first (PR descriptions in these
                     repos deliberately omit ticket ids, so the branch is the
                     link), then from commit subjects and PR text as a fallback.
  NEEDS AN AGENT:    everything inside Linear — ticket title, status, project,
                     parent, subtickets, relations, and the "AI post-context"
                     handover block in the description. A shell has no Linear MCP.
                     If LINEAR_API_KEY (or LINEAR_TOKEN / LINEAR_API_TOKEN) is
                     exported this script queries the Linear API directly;
                     otherwise it prints the exact ticket ids, URLs and MCP calls
                     for an agent to run. There is no token on this machine today,
                     so the agent hand-off is the normal path.

EXIT CODES
  0 something was resolved · 1 nothing resolved · 2 bad usage
EOF
}

die() { printf 'lf-context: %s\n' "$1" >&2; exit "${2:-2}"; }
hdr() { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }

# --- args ---------------------------------------------------------------------
[ $# -eq 0 ] && { usage; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --path)   KIND=path;   TARGET="$2"; shift 2 ;;
    --sha)    KIND=sha;    TARGET="$2"; shift 2 ;;
    --pr)     KIND=pr;     TARGET="$2"; shift 2 ;;
    --ticket) KIND=ticket; TARGET="$2"; shift 2 ;;
    --dir)    DIR="$2";    shift 2 ;;
    --repo)   REPO="$2";   shift 2 ;;
    --rev)    REV="$2";    shift 2 ;;
    --limit)  LIMIT="$2";  shift 2 ;;
    --offline) ONLINE=0;   shift ;;
    -*) die "unknown option $1" ;;
    *) [ -n "$TARGET" ] && die "more than one target given ($TARGET, $1)"
       TARGET="$1"; shift ;;
  esac
done
[ -z "$TARGET" ] && die "no target given (try --help)"

upper() { printf '%s' "$1" | tr 'a-z' 'A-Z'; }
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }

# keys longest-first so `lfe-1` never matches as `lf`
KEYS_RE=$(printf '%s' "$KEYS" | tr ',' '\n' | awk '{print length, $0}' | sort -rn |
          awk '{print $2}' | paste -sd'|' -)
[ -z "$KEYS_RE" ] && KEYS_RE='lfe|lf'

# --- detect the target kind ---------------------------------------------------
if [ -z "$KIND" ]; then
  T_LOWER=$(lower "$TARGET")
  case "$T_LOWER" in
    '#'*) KIND=pr; TARGET="${TARGET#\#}" ;;
  esac
  if [ -z "$KIND" ]; then
    if printf '%s' "$T_LOWER" | grep -qE "^($KEYS_RE|[a-z]{2,5})-[0-9]{1,6}$" && [ ! -e "$TARGET" ]; then
      KIND=ticket
    elif printf '%s' "$TARGET" | grep -qE '^[0-9]{1,6}$'; then
      KIND=pr
    elif [ -e "$TARGET" ] || printf '%s' "$TARGET" | grep -q '[/.]'; then
      KIND=path
    elif printf '%s' "$T_LOWER" | grep -qE '^[0-9a-f]{7,40}$'; then
      KIND=sha
    else
      KIND=sha  # let git decide (tags, HEAD~3, …)
    fi
  fi
fi

# --- locate the checkout ------------------------------------------------------
REL=""
if [ "$KIND" = path ]; then
  if [ -e "$TARGET" ]; then
    ABS=$(cd "$(dirname "$TARGET")" 2>/dev/null && pwd)/$(basename "$TARGET")
    DIR=${DIR:-$(git -C "$(dirname "$ABS")" rev-parse --show-toplevel 2>/dev/null)}
    [ -z "$DIR" ] && die "$TARGET is not inside a git repo" 1
    REL=${ABS#"$DIR"/}
  else
    DIR=${DIR:-$APP_DEFAULT}
    REL=$TARGET
    case "$REL" in "$DIR"/*) REL=${REL#"$DIR"/} ;; esac
  fi
else
  DIR=${DIR:-$APP_DEFAULT}
fi
if [ -z "$DIR" ]; then
  die "no checkout to read: run this from inside the repo, or pass --dir PATH, or export LANGFUSE_REPO" 1
fi
[ -d "$DIR/.git" ] || [ -f "$DIR/.git" ] || die "not a git checkout: $DIR" 1
TOP=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null) || die "not a git checkout: $DIR" 1
DIR=$TOP

if [ -z "$REPO" ]; then
  ORIGIN=$(git -C "$DIR" remote get-url origin 2>/dev/null)
  REPO=$(printf '%s' "$ORIGIN" | sed -e 's#^git@github.com:##' -e 's#^https://github.com/##' -e 's#\.git$##')
  [ -z "$REPO" ] && REPO=$REPO_DEFAULT
fi

# --- pick the revision to walk ------------------------------------------------
if [ -z "$REV" ]; then
  REV=HEAD
  DEF=$(git -C "$DIR" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
  [ -z "$DEF" ] && DEF=origin/main
  if git -C "$DIR" rev-parse --verify --quiet "$DEF" >/dev/null 2>&1 &&
     git -C "$DIR" merge-base --is-ancestor HEAD "$DEF" 2>/dev/null &&
     ! git -C "$DIR" merge-base --is-ancestor "$DEF" HEAD 2>/dev/null; then
    REV=$DEF
    REV_NOTE="(HEAD is behind $DEF — walking $DEF so recent PRs are visible)"
  fi
fi

HAVE_GH=0
if [ "$ONLINE" -eq 1 ] && command -v gh >/dev/null 2>&1; then HAVE_GH=1; fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/lf-context.XXXXXX") || die "cannot mktemp" 1
trap 'rm -rf "$TMP"' EXIT
: >"$TMP/prs"      # one PR number per line
: >"$TMP/tickets"  # "TICKET<TAB>source" per line
: >"$TMP/shas"

add_tickets() { # $1 text, $2 source label
  printf '%s\n' "$1" | grep -oiE "($KEYS_RE)-[0-9]{1,6}" | while read -r m; do
    printf '%s\t%s\n' "$(upper "$m")" "$2" >>"$TMP/tickets"
  done
}

printf '\033[1mlf-context\033[0m  %s: %s\n' "$KIND" "$TARGET"
printf '  repo %s  ·  checkout %s\n' "$REPO" "$DIR"
[ "$KIND" = path ] && printf '  rev  %s %s\n' "$REV" "${REV_NOTE:-}"
[ "$HAVE_GH" -eq 0 ] && printf '  (offline: no gh — git-only resolution)\n'

# --- step 1: the git side -----------------------------------------------------
case "$KIND" in
  path)
    LOG=$(git -C "$DIR" log --follow --date=short --format='%h|%ad|%an|%s' -n "$LIMIT" "$REV" -- "$REL" 2>/dev/null)
    if [ -z "$LOG" ]; then
      hdr "commits"
      note "no commits touch '$REL' in $REV."
      note "checks: is the path spelled right? is it new/untracked? deleted upstream?"
      note "try:    another --rev (a feature branch, origin/main), or --dir <the worktree that has it>"
      note "        git -C $DIR log --all --oneline -- '*$(basename "$REL")'"
      exit 1
    fi
    hdr "commits touching $REL (newest $LIMIT of $(git -C "$DIR" rev-list --count "$REV" -- "$REL" 2>/dev/null))"
    printf '%s\n' "$LOG" | while IFS='|' read -r sh dt an su; do
      printf '  %s  %s  %-18s %s\n' "$sh" "$dt" "$(printf '%.18s' "$an")" "$su"
    done
    printf '%s\n' "$LOG" | cut -d'|' -f1 >"$TMP/shas"
    printf '%s\n' "$LOG" | cut -d'|' -f4 | while read -r su; do
      printf '%s\n' "$su" | grep -oE '\(#[0-9]+\)' | tr -d '(#)' >>"$TMP/prs"
      add_tickets "$su" "commit subject"
    done
    ;;
  sha)
    FULL=$(git -C "$DIR" rev-parse --verify --quiet "${TARGET}^{commit}" 2>/dev/null)
    [ -z "$FULL" ] && die "git cannot resolve '$TARGET' in $DIR (wrong checkout? unfetched branch?)" 1
    hdr "commit"
    git -C "$DIR" log -1 --date=short --format='  %h  %ad  %an%n  %s%n' "$FULL" | sed 's/^/ /'
    printf '%s\n' "$FULL" >"$TMP/shas"
    SUB=$(git -C "$DIR" log -1 --format='%s%n%b' "$FULL")
    printf '%s\n' "$SUB" | grep -oE '\(#[0-9]+\)' | tr -d '(#)' >>"$TMP/prs"
    add_tickets "$SUB" "commit message"
    BRANCHES=$(git -C "$DIR" branch -a --contains "$FULL" --format='%(refname:short)' 2>/dev/null |
               grep -v '^origin/HEAD' | head -12)
    hdr "branches containing it"
    if [ -z "$BRANCHES" ]; then
      note "none — the commit is unreferenced locally (rewritten, or on a branch this checkout never fetched)"
    else
      printf '%s\n' "$BRANCHES" | while read -r b; do note "$b"; done
      add_tickets "$BRANCHES" "branch containing the sha"
    fi
    ;;
  pr)
    printf '%s\n' "$TARGET" >"$TMP/prs"
    ;;
  ticket)
    TICKET=$(upper "$TARGET")
    printf '%s\t%s\n' "$TICKET" "given" >>"$TMP/tickets"
    hdr "branches for $TICKET"
    LOCAL=$(git -C "$DIR" branch -a --format='%(refname:short)' 2>/dev/null |
            grep -i -- "$(lower "$TICKET")" | head -20)
    if [ -n "$LOCAL" ]; then printf '%s\n' "$LOCAL" | while read -r b; do note "$b"; done
    else note "none in this checkout (may exist only on the remote, or be deleted after merge)"; fi
    if [ "$HAVE_GH" -eq 1 ]; then
      # GitHub search cannot query branch names, so scan the recent PR list and
      # match the identifier against head branches (the reliable link) + text.
      gh pr list --repo "$REPO" --state all --limit 300 \
         --json number,headRefName,title,body \
         --jq ".[] | select(((.headRefName + \" \" + .title + \" \" + (.body//\"\")) | ascii_downcase) | contains(\"$(lower "$TICKET")\")) | .number" \
         2>/dev/null >>"$TMP/prs"
    fi
    ;;
esac

# sha -> PR via the commits API, for anything the squash subject did not name
if [ "$HAVE_GH" -eq 1 ] && [ -s "$TMP/shas" ] && [ ! -s "$TMP/prs" ]; then
  while read -r sh; do
    [ -z "$sh" ] && continue
    gh api "repos/$REPO/commits/$sh/pulls" --jq '.[].number' 2>/dev/null >>"$TMP/prs"
  done <"$TMP/shas"
fi

PRS=$(sort -un "$TMP/prs" | head -"$LIMIT")

# --- step 2: the PR side ------------------------------------------------------
hdr "pull requests"
if [ -z "$PRS" ]; then
  note "none resolved."
  [ "$HAVE_GH" -eq 0 ] && note "gh is unavailable — squash subjects '(#N)' were the only source."
  [ "$HAVE_GH" -eq 1 ] && note "the commits are probably pre-squash history, or never opened a PR."
else
  if [ "$HAVE_GH" -eq 0 ]; then
    printf '%s\n' "$PRS" | while read -r n; do note "#$n  (gh unavailable — no detail)"; done
  else
    for n in $PRS; do
      J=$(gh pr view "$n" --repo "$REPO" \
            --json number,state,title,headRefName,baseRefName,url,body,mergedAt 2>/dev/null)
      if [ -z "$J" ]; then note "#$n  (gh could not read it — auth? wrong repo?)"; continue; fi
      printf '%s' "$J" | jq -r '"  #\(.number)  \(.state + "       "|.[0:7])  \(.headRefName) → \(.baseRefName)\n      \(.title)\n      \(.url)"'
      BR=$(printf '%s' "$J" | jq -r '.headRefName')
      add_tickets "$BR" "branch of #$n"
      TXT=$(printf '%s' "$J" | jq -r '.title + "\n" + (.body//"")')
      add_tickets "$TXT" "text of #$n"
      if printf '%s' "$TXT" | grep -qiE 'AI post-context|🤖 AI'; then
        note "     ^ this PR body carries an AI handover block"
      fi
    done
  fi
fi

# --- step 3: ticket ids -------------------------------------------------------
hdr "linear tickets"
IDS=$(cut -f1 "$TMP/tickets" | sort -u)
if [ -z "$IDS" ]; then
  note "no ticket id found."
  note "branch names are the link here (PR descriptions deliberately omit ids),"
  note "so a branch like 'chore/bump-deps' genuinely has no ticket — that is not an error."
  note "keys searched: $KEYS_RE (override with LINEAR_KEYS=lfe,lf,ch)"
else
  for id in $IDS; do
    SRC=$(grep "^$id	" "$TMP/tickets" | cut -f2 | sort -u | tr '\n' '|' | sed -e 's/|$//' -e 's/|/, /g')
    printf '  %-12s https://linear.app/%s/issue/%s\n' "$id" "$SLUG" "$id"
    printf '  %-12s via %s\n' "" "$SRC"
  done
fi

# --- step 4: Linear itself ----------------------------------------------------
TOKEN="${LINEAR_API_KEY:-${LINEAR_TOKEN:-${LINEAR_API_TOKEN:-}}}"
# Personal API keys go in the header raw; OAuth access tokens need "Bearer".
case "$TOKEN" in
  ""|"Bearer "*|lin_api_*) AUTH="$TOKEN" ;;
  *)                       AUTH="Bearer $TOKEN" ;;
esac

linear_fetch() { # $1 ticket id
  local q body
  q='query($id:String!){issue(id:$id){identifier title url state{name} project{name url}
      labels(first:20){nodes{name}}
      parent{identifier title url state{name}}
      children(first:50){nodes{identifier title url state{name}}}
      relations(first:30){nodes{type relatedIssue{identifier title url}}}
      description}}'
  body=$(jq -nc --arg q "$q" --arg id "$1" '{query:$q,variables:{id:$id}}')
  curl -sS -X POST https://api.linear.app/graphql \
       -H "Authorization: $AUTH" -H 'Content-Type: application/json' \
       -d "$body" 2>/dev/null
}

if [ -z "$IDS" ]; then
  :
elif [ -n "$TOKEN" ] && [ "$ONLINE" -eq 1 ]; then
  for id in $IDS; do
    R=$(linear_fetch "$id")
    ERR=$(printf '%s' "$R" | jq -r '(.errors[0].message // empty)' 2>/dev/null)
    if [ -n "$ERR" ] || [ -z "$R" ]; then
      hdr "$id — Linear API said no"
      note "${ERR:-empty response}"
      note "fall back to an agent: get_issue(id: \"$id\", includeRelations: true)"
      continue
    fi
    hdr "$id — from the Linear API"
    printf '%s' "$R" | jq -r '
      .data.issue as $i |
      "  \($i.identifier)  [\($i.state.name)]  \($i.title)",
      "  \($i.url)",
      (if $i.project then "  project:  \($i.project.name)  \($i.project.url)" else "  project:  —" end),
      (if ($i.labels.nodes|length)>0 then "  labels:   " + ([$i.labels.nodes[].name]|join(", ")) else empty end),
      (if $i.parent then "  parent:   \($i.parent.identifier)  [\($i.parent.state.name)]  \($i.parent.title)" else empty end),
      (if ($i.children.nodes|length)>0 then "  subtickets:" , ($i.children.nodes[] | "    \(.identifier)  [\(.state.name)]  \(.title)") else empty end),
      (if ($i.relations.nodes|length)>0 then "  relations:" , ($i.relations.nodes[] | "    \(.type)  \(.relatedIssue.identifier)  \(.relatedIssue.title)") else empty end)
    '
    DESC=$(printf '%s' "$R" | jq -r '.data.issue.description // ""')
    if printf '%s' "$DESC" | grep -qiE 'AI post-context|🤖 AI'; then
      printf '  \033[1mAI handover block:\033[0m\n'
      printf '%s\n' "$DESC" | sed -n '/AI post-context/,$p' | head -60 | sed 's/^/    /'
    else
      note "no AI handover block in the description"
    fi
  done
else
  hdr "linear — needs an agent (no LINEAR_API_KEY in this shell)"
  note "the ids and URLs above are resolved; the ticket bodies are not. Run, per ticket:"
  for id in $IDS; do
    note "  get_issue(id: \"$id\", includeRelations: true)      # title, status, project, parent, description"
    note "  list_issues(parentId: \"$id\")                       # the subtickets = the PR stack"
  done
  note "  list_issues(label: \"AI edited\", project: \"<the project above>\")   # where prior agent reasoning lives"
  note ""
  note "then read each description's '🤖 AI post-context' block before designing anything:"
  note "a reversal already litigated once does not need re-litigating."
  note "practice: the linear-context-handover skill (reconstruct + handover),"
  note "          the linear-planning skill (slicing a feature into a PR stack)."
fi

printf '\n'
[ -n "$IDS" ] || [ -n "$PRS" ] || exit 1
exit 0
