#!/usr/bin/env bash
#
# Tests for scripts/ci/retry-on-merge-queue.sh.
#
# The wrapper decides whether a failing CI step gets a second chance, so the
# two directions both matter: it must retry inside the merge queue, and it must
# not retry anywhere else (a flaky pull-request run has to stay visible to its
# author).

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/scripts/ci/retry-on-merge-queue.sh"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

pass() {
  echo "ok - $*"
}

# A command that fails for its first `n` invocations and succeeds afterwards,
# recording every invocation so the call count can be asserted.
make_command() {
  local path="$1" fail_times="$2" exit_code="$3"
  cat <<EOF >"$path"
#!/usr/bin/env bash
count_file="\$(dirname "\$0")/count"
attempts=\$(( \$(cat "\$count_file" 2>/dev/null || echo 0) + 1 ))
echo "\$attempts" > "\$count_file"
if [[ "\$attempts" -le $fail_times ]]; then
  exit $exit_code
fi
exit 0
EOF
  chmod +x "$path"
  rm -f "$(dirname "$path")/count"
}

attempts_for() {
  cat "$(dirname "$1")/count" 2>/dev/null || echo 0
}

run_case() {
  local name="$1" event="$2" fail_times="$3" exit_code="$4"
  local want_status="$5" want_attempts="$6" want_marker="$7"

  local casedir="$tmpdir/$name"
  mkdir -p "$casedir"
  local cmd="$casedir/cmd.sh"
  make_command "$cmd" "$fail_times" "$exit_code"

  local out status
  out="$(GITHUB_EVENT_NAME="$event" GITHUB_STEP_SUMMARY="" bash "$script" "$cmd" 2>&1)"
  status=$?

  local attempts marker="no"
  attempts="$(attempts_for "$cmd")"
  if grep -q "LANGFUSE_CI_FLAKY_RETRY_SUCCEEDED" <<<"$out"; then
    marker="yes"
  fi

  if [[ "$status" -ne "$want_status" ]]; then
    fail "$name: exit status was $status, want $want_status"
  elif [[ "$attempts" -ne "$want_attempts" ]]; then
    fail "$name: ran the command $attempts time(s), want $want_attempts"
  elif [[ "$marker" != "$want_marker" ]]; then
    fail "$name: flaky marker '$marker', want '$want_marker'"
  else
    pass "$name"
  fi
}

#        name                     event         fails exit  status attempts marker
run_case "merge-queue-clean"      merge_group   0     1     0      1        no
run_case "merge-queue-flaky"      merge_group   1     1     0      2        yes
run_case "merge-queue-hard-fail"  merge_group   2     3     3      2        no
run_case "pull-request-no-retry"  pull_request  1     1     1      1        no
run_case "push-no-retry"          push          1     1     1      1        no
run_case "unset-event-no-retry"   ""            1     1     1      1        no

# A non-zero exit status must survive the wrapper verbatim, so a job that keys
# off a specific code still sees it.
run_case "propagates-exit-status"  pull_request 1     42    42     1        no

# No command at all is a usage error, not a silent success.
if bash "$script" >/dev/null 2>&1; then
  fail "no-arguments: expected a non-zero exit"
else
  status=$?
  if [[ "$status" -ne 2 ]]; then
    fail "no-arguments: exit status was $status, want 2"
  else
    pass "no-arguments"
  fi
fi

# The step summary is appended to only when GitHub provides one.
summary="$tmpdir/summary.md"
: >"$summary"
summary_cmd_dir="$tmpdir/summary-case"
mkdir -p "$summary_cmd_dir"
make_command "$summary_cmd_dir/cmd.sh" 1 1
GITHUB_EVENT_NAME=merge_group GITHUB_STEP_SUMMARY="$summary" \
  bash "$script" "$summary_cmd_dir/cmd.sh" >/dev/null 2>&1
if grep -q "Flaky step" "$summary"; then
  pass "writes-step-summary"
else
  fail "writes-step-summary: expected a flaky note in \$GITHUB_STEP_SUMMARY"
fi

if [[ "$failures" -ne 0 ]]; then
  echo "$failures test(s) failed" >&2
  exit 1
fi

echo "All retry-on-merge-queue tests passed."
