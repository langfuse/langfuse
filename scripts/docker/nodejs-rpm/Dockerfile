# TEMPORARY(CVE-2026-111497): see build.sh.
#
# Builds the patched nodejs:24 RPMs and publishes them as a scratch image of
# /rpms, which web/Dockerfile and worker/Dockerfile pull by digest. Built and
# pushed by .github/workflows/nodejs-rpm.yml; a cold build compiles all of Node
# and V8 (about 70 minutes on 16 x86_64 cores with 12 jobs, ~10 GB RAM).
ARG BASE_IMAGE=registry.access.redhat.com/ubi9/ubi:9.8

FROM ${BASE_IMAGE} AS builder
COPY build.sh 0002-deps-brotli-CVE-2026-111497-block-switch.patch /build/
ARG NODE_BUILD_JOBS
ARG NODEJS_RPM_CHECK=1
RUN NODE_BUILD_JOBS="${NODE_BUILD_JOBS}" NODEJS_RPM_CHECK="${NODEJS_RPM_CHECK}" \
    bash /build/build.sh

# Installs the RPMs the way the images do and checks the fix and FIPS mode, so
# an image that fails either cannot be published.
FROM ${BASE_IMAGE} AS verify
COPY install-nodejs.sh test-brotli-cve.js /verify/
RUN --mount=type=bind,from=builder,source=/out/rpms,target=/rpms \
    bash /verify/install-nodejs.sh /rpms nodejs nodejs-libs nodejs-full-i18n npm \
    openssl-fips-provider openssl-fips-provider-so && \
    rpm -q nodejs | grep -q '\.lf1\.' && \
    node /verify/test-brotli-cve.js && \
    OPENSSL_FORCE_FIPS_MODE=1 node -e ' \
      const assert = require("node:assert/strict"); \
      const crypto = require("node:crypto"); \
      assert.equal(crypto.getFips(), 1, "FIPS provider not active"); \
      assert.throws(() => crypto.createHash("md5"), { code: "ERR_OSSL_EVP_UNSUPPORTED" });' && \
    rpm -q nodejs > /verified

FROM scratch
COPY --from=builder /out/rpms/ /rpms/
COPY --from=verify /verified /rpms/verified
