#!/usr/bin/env bash
#
# Run a command and, in the merge queue only, retry it once if it fails.
#
# The merge queue watches a single required check (the `all-ci-passed` gate in
# pipeline.yml). GitHub drops a pull request from the queue the moment that
# check reports a failure, so a retry is only useful if it happens *before* the
# job concludes — a `workflow_run` listener that re-runs failed jobs afterwards
# is too late, the pull request has already left the queue. Hence this wrapper
# sits inside the job, around the command that actually runs the tests.
#
# The retry is deliberately limited to `merge_group`:
#
#   * On a pull request a failure must stay a failure. Retrying there would
#     hide flakiness from the author, who is the person best placed to fix it.
#   * In the merge queue the code has already been reviewed and the branch has
#     already passed CI once, so a single transient failure costs a full
#     dequeue/requeue cycle for everyone behind it in the queue.
#
# A retry that succeeds is not swallowed: the command is announced as flaky on
# stdout with FLAKY_MARKER, which the `notify-flaky-merge-queue` job greps out
# of the job logs to report to Slack.
#
# Worst case this is no worse than not retrying: if the second attempt fails
# too, the original exit status is propagated and the job fails exactly as it
# would have before.

# No `set -e`: the whole point is to observe a non-zero exit and carry on.
set -uo pipefail

# Keep in sync with the grep in pipeline.yml's `notify-flaky-merge-queue` job.
readonly FLAKY_MARKER="LANGFUSE_CI_FLAKY_RETRY_SUCCEEDED"

if [[ "$#" -eq 0 ]]; then
  echo "Usage: retry-on-merge-queue.sh <command> [args...]" >&2
  exit 2
fi

"$@"
status=$?

if [[ "${status}" -eq 0 ]]; then
  exit 0
fi

if [[ "${GITHUB_EVENT_NAME:-}" != "merge_group" ]]; then
  exit "${status}"
fi

echo "::warning title=Retrying a failed merge-queue step::Command failed with exit ${status}; retrying once before failing the merge queue: $*"

"$@"
retry_status=$?

if [[ "${retry_status}" -ne 0 ]]; then
  echo "::error title=Merge-queue retry failed::Both attempts failed (exit ${status}, then ${retry_status}): $*"
  exit "${retry_status}"
fi

echo "::warning title=Flaky CI::Command failed once and passed on retry: $*"
echo "${FLAKY_MARKER} job=${GITHUB_JOB:-unknown} command=$*"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '⚠️ Flaky step: `%s` failed with exit %s and passed on retry.\n' "$*" "${status}" >>"${GITHUB_STEP_SUMMARY}"
fi
