#!/usr/bin/env bash
# TEMPORARY(CVE-2026-111497): see build.sh.
#
# Enables the nodejs:24 module and installs the given packages in one dnf
# transaction, taking nodejs, nodejs-libs, nodejs-full-i18n and npm from the
# patched RPMs built by build.sh only while those are newer than what Red Hat's
# repos offer. Once Red Hat ships a newer nodejs, this installs theirs instead,
# and test-brotli-cve.js (run by the Dockerfiles right after) decides whether
# it also fixes the CVE: if it does, delete scripts/docker/nodejs-rpm/; if not,
# rebase the patch onto Red Hat's new source RPM.
#
# Usage: install-nodejs.sh RPM_DIR PACKAGE...
#   NODEJS_INSTALLROOT  install into this root instead of /. Pass every package
#                       in one call: once the root holds packages, dnf reads
#                       its repo config from there and loses the UBI repos.
set -euo pipefail

readonly RPM_DIR="${1:?usage: install-nodejs.sh RPM_DIR PACKAGE...}"
shift
[ "$#" -gt 0 ] || { echo "usage: install-nodejs.sh RPM_DIR PACKAGE..." >&2; exit 1; }
readonly PATCHED_NAMES=" nodejs nodejs-libs nodejs-full-i18n npm "

dnf_args=(-y --setopt=install_weak_deps=0)
if [ -n "${NODEJS_INSTALLROOT:-}" ]; then
  dnf_args+=(--installroot "$NODEJS_INSTALLROOT" --releasever 9 \
    --disableexcludes=all --setopt=tsflags=nodocs)
fi

dnf "${dnf_args[@]}" module enable nodejs:24

vendored_rpm="$(find "$RPM_DIR" -name 'nodejs-[0-9]*.rpm' | head -n 1)"
[ -n "$vendored_rpm" ] || { echo "No nodejs RPM in ${RPM_DIR}" >&2; exit 1; }
vendored="$(rpm -qp --qf '%{EPOCHNUM}:%{VERSION}-%{RELEASE}' "$vendored_rpm")"
available="$(dnf "${dnf_args[@]}" -q repoquery --latest-limit 1 \
  --qf '%{epoch}:%{version}-%{release}' nodejs | tail -n 1)"
[ -n "$available" ] || { echo "nodejs:24 is not available from the repos" >&2; exit 1; }

packages=("$@")
if [ "$(rpm --eval "%{lua: print(rpm.vercmp('${vendored}', '${available}'))}")" -gt 0 ]; then
  echo "Installing patched nodejs ${vendored} (repos offer ${available})"
  for i in "${!packages[@]}"; do
    name="${packages[$i]}"
    [[ "$PATCHED_NAMES" == *" ${name} "* ]] || continue
    file="$(find "$RPM_DIR" -name "${name}-[0-9]*.rpm" | head -n 1)"
    [ -n "$file" ] || { echo "No ${name} RPM in ${RPM_DIR}" >&2; exit 1; }
    packages[$i]="$file"
  done
else
  echo "Red Hat's nodejs ${available} is not older than the patched ${vendored};" \
    "installing it. If the Brotli check passes, remove scripts/docker/nodejs-rpm/."
fi

# The patched RPMs are built in CI from Red Hat's signed source RPM and pulled
# into the image build by digest, so they carry no package signature to check.
dnf "${dnf_args[@]}" --setopt=localpkg_gpgcheck=0 install "${packages[@]}"
