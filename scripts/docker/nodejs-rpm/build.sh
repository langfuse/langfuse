#!/usr/bin/env bash
# TEMPORARY(node-24.22.1-security): remove scripts/docker/nodejs-rpm/ once Red
# Hat ships a nodejs:24 errata for RHEL 9 that passes test-node-security-fixes.js.
#
# Rebuilds Red Hat's nodejs:24 module RPMs from their source RPM with these
# fixes from Node 24.22.1, vendored verbatim from its v24.x branch:
#   0002  nodejs/node@49dff6f57aa7  CVE-2026-111497  bundled Brotli decoder
#                                   (in libnode, so the system brotli package
#                                   does not fix it)
#   0003  nodejs/node@de49c913f232  CVE-2026-105483  tls: IP normalization
#   0004  nodejs/node@935918e34279  CVE-2026-106069  tls: non-canonical IPs
#   0005  nodejs/node@843a1627dce1  CVE-2026-105482  dns: null bytes in names
# 0004 rewrites the code 0003 adds, so they apply in that (upstream) order.
#
# Everything else is Red Hat's: spec, patches (including the FIPS patch),
# configure flags and compiler flags. Node keeps linking the system OpenSSL, so
# node:crypto stays on RHEL's FIPS provider.
#
# The release gets a ".lf1" suffix on top of Red Hat's: it sorts above the
# vulnerable build and below any later Red Hat release, so the images switch
# back to Red Hat's package as soon as one exists
# (scripts/docker/nodejs-rpm/install-nodejs.sh).
#
# Runs as root on UBI 9 and writes the runtime RPMs to /out/rpms.
#   NODE_BUILD_JOBS   compile jobs (default: one per CPU; ~1.5 GB RAM each)
#   NODEJS_RPM_CHECK  1 runs the spec's %check test suite (default), 0 skips it
set -euo pipefail

readonly SRPM_NAME=nodejs-24.21.0-1.module+el9.8.0+24924+cd677006.src.rpm
readonly SRPM_SHA256=3f5b2604c4b8391235ab4bc3de0e1e2e847fe9cca2167f7b8612fda7874f121e
# UBI's public source repo: no Red Hat subscription needed. Source RPMs are
# architecture-independent, so the x86_64 path serves every build arch.
readonly SRPM_URL="https://cdn-ubi.redhat.com/content/public/ubi/dist/ubi9/9/x86_64/appstream/source/SRPMS/Packages/n/${SRPM_NAME}"
readonly DIST=.module+el9.8.0+24924+cd677006.lf1
readonly -a PATCHES=(
  0002-deps-brotli-CVE-2026-111497-block-switch.patch
  0003-tls-CVE-2026-105483-ip-normalization-regression.patch
  0004-tls-CVE-2026-106069-reject-non-canonical-ip.patch
  0005-dns-CVE-2026-105482-reject-null-bytes.patch
)
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly TOPDIR=/build/rpmbuild
readonly BUILD_JOBS="${NODE_BUILD_JOBS:-$(nproc)}"
readonly RUN_CHECK="${NODEJS_RPM_CHECK:-1}"

if [[ ! "$BUILD_JOBS" =~ ^[1-9][0-9]*$ ]]; then
  echo "NODE_BUILD_JOBS must be a positive integer" >&2
  exit 1
fi

dnf -y install --setopt=install_weak_deps=0 rpm-build dnf-plugins-core
# nodejs-packaging, a build dependency, only exists inside the module.
dnf -y module enable nodejs:24

mkdir -p "$TOPDIR"
curl --fail --show-error --silent --location --retry 5 --retry-all-errors \
  --output "/build/${SRPM_NAME}" "$SRPM_URL"
printf '%s  %s\n' "$SRPM_SHA256" "/build/${SRPM_NAME}" | sha256sum --check --strict -
rpmkeys --import /etc/pki/rpm-gpg/RPM-GPG-KEY-redhat-release
rpm --checksig "/build/${SRPM_NAME}"
rpm -i --define "_topdir ${TOPDIR}" "/build/${SRPM_NAME}"

readonly SPEC="${TOPDIR}/SPECS/nodejs.spec"
for patch in "${PATCHES[@]}"; do
  cp "${SCRIPT_DIR}/${patch}" "${TOPDIR}/SOURCES/"
done
# Apply after Red Hat's FIPS patch; %autosetup -S git_am applies %patchlist in
# order with git am, which fails on any patch that does not apply exactly.
sed -i "s|^0001-fips-disable-options.patch\$|&$(printf '\\n%s' "${PATCHES[@]}")|" "$SPEC"
sed -i "s|^%changelog\$|&\n* $(LC_ALL=C date -u '+%a %b %d %Y') gage-clickhouse <gage.hainer@clickhouse.com> - 1:24.21.0-1${DIST}\n- Backport fixes from Node 24.22.1 for CVE-2026-111497 (bundled Brotli),\n  CVE-2026-105483 and CVE-2026-106069 (tls), CVE-2026-105482 (dns)\n|" "$SPEC"
for patch in "${PATCHES[@]}"; do
  grep -qx "$patch" "$SPEC" || { echo "Failed to add ${patch} to ${SPEC}" >&2; exit 1; }
done

# Red Hat builds with every dependency bundled, as the binary RPM's
# bundled(...) provides show. The spec derives that from its bootstrap bcond,
# which RHEL 9's rpm 4.16 does not propagate, so set it directly; without it,
# the build devendors Brotli and needs packages UBI does not carry.
readonly -a RPM_DEFINES=(
  --define "_topdir ${TOPDIR}"
  --define "dist ${DIST}"
  --define "_smp_build_ncpus ${BUILD_JOBS}"
  --define "_with_all_deps_bundled --with-all_deps_bundled"
)
dnf -y builddep "${RPM_DEFINES[@]}" "$SPEC"

check_flag=()
[ "$RUN_CHECK" = "1" ] || check_flag=(--nocheck)
rpmbuild -bb "${check_flag[@]}" "${RPM_DEFINES[@]}" "$SPEC"

# Only the packages the images install; debuginfo, -devel and -docs stay here.
mkdir -p /out/rpms
for name in nodejs nodejs-libs nodejs-full-i18n npm; do
  find "${TOPDIR}/RPMS" -name "${name}-[0-9]*${DIST}.*.rpm" -exec cp {} /out/rpms/ \;
done
test "$(find /out/rpms -name '*.rpm' | wc -l)" -eq 4
patches_json="$(for patch in "${PATCHES[@]}"; do
  printf '{"name":"%s","sha256":"%s"}\n' "$patch" \
    "$(sha256sum "${SCRIPT_DIR}/${patch}" | cut -d ' ' -f 1)"
done | paste -sd ,)"
printf '{"srpm":"%s","srpmSha256":"%s","patches":[%s],"check":%s}\n' \
  "$SRPM_NAME" "$SRPM_SHA256" "$patches_json" \
  "$([ "$RUN_CHECK" = "1" ] && echo true || echo false)" \
  > /out/rpms/build-info.json
ls -l /out/rpms
