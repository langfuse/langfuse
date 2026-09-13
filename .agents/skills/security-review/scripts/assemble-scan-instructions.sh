#!/usr/bin/env bash
# Concatenate the security-review skill into one instructions file for the
# Claude Code PR security scan (`custom-security-scan-instructions`).
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-}"

if [[ -z "${out}" ]]; then
  echo "usage: assemble-scan-instructions.sh <output-path>" >&2
  exit 2
fi

if [[ ! -f "${skill_dir}/SKILL.md" ]]; then
  echo "missing ${skill_dir}/SKILL.md" >&2
  exit 1
fi

mkdir -p "$(dirname "${out}")"

{
  cat <<'EOF'
# Langfuse-specific security scan instructions

The following is Langfuse's `security-review` skill. Treat it as additive
Langfuse threat-model categories for this PR security scan.

Apply Review Mode. Do not treat Design/Plan Mode as a reason to skip a
finding. Prefer the named canonical helpers over generic advice. Do not
flag call sites that already use those helpers correctly. Missing negative
tests on a matching surface are findings.
EOF

  printf '\n---\n# SKILL.md\n\n'
  cat "${skill_dir}/SKILL.md"
  printf '\n---\n# references/checklist.md\n\n'
  cat "${skill_dir}/references/checklist.md"

  shopt -s nullglob
  for f in "${skill_dir}/references/"*.md; do
    base="$(basename "${f}")"
    if [[ "${base}" == "checklist.md" ]]; then
      continue
    fi
    printf '\n---\n# references/%s\n\n' "${base}"
    cat "${f}"
  done
} >"${out}"

if [[ ! -s "${out}" ]]; then
  echo "assembled instructions file is empty: ${out}" >&2
  exit 1
fi
