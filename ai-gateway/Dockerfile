# Alpine builder and runtime, built on Iron Bank's hardened Alpine for Langfuse
# Cloud. The gateway has no FIPS image variant: its outbound HTTP client
# (reqwest) uses rustls, not the system OpenSSL.
# The default is the public Alpine image, so the build needs no credentials.
# Iron Bank serves Alpine from an authenticated registry with DoD provenance
# and scan attestations. Cloud builds opt in after `docker login
# registry1.dso.mil` (free P1 account plus a CLI secret):
#   --build-arg BASE_IMAGE=registry1.dso.mil/ironbank/opensource/alpinelinux/alpine:3.24
ARG BASE_IMAGE=alpine:3.24

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS builder

ARG TARGETARCH

# gcc and musl-dev provide the linker and C runtime objects; bash runs the
# toolchain installer (busybox wget fetches it). Alpine's own rust package
# trails the version rust-toolchain.toml pins, so the toolchain comes from the
# standalone installer below.
RUN apk upgrade --no-cache && \
    apk add --no-cache gcc musl-dev bash

# Pinned standalone Rust 1.98.0 installer, the exact channel from
# rust-toolchain.toml (keep the version in sync with it), checksum-verified.
# rustup-init would fetch the rustup binary from an unversioned URL, and only
# rustc, cargo and the target's std are needed to build; docs, clippy and
# rustfmt stay out of the builder image (CI runs fmt and clippy outside
# Docker).
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
    amd64) triple=x86_64-unknown-linux-musl; toolchain_sha256=b2cf07e41d4747ddf3b20962ca9de2a08da00646f55ab4c1b51cef99895bae0a ;; \
    arm64) triple=aarch64-unknown-linux-musl; toolchain_sha256=c26e37bb6f20e49498c552e53e3f34871ba2f7610c7f8b2cce38a48e3570c7de ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    wget -qO /tmp/rust.tar.gz "https://static.rust-lang.org/dist/rust-1.98.0-${triple}.tar.gz"; \
    echo "${toolchain_sha256}  /tmp/rust.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/rust.tar.gz -C /tmp; \
    /tmp/rust-1.98.0-${triple}/install.sh --prefix=/usr/local \
    --components=rustc,cargo,rust-std-${triple}; \
    rm -rf /tmp/rust.tar.gz /tmp/rust-1.98.0-${triple}

# rustc links musl targets statically by default; link musl dynamically so the
# binary uses the runtime image's musl, which `apk upgrade` keeps patched,
# rather than a copy frozen at build time. This does not select a TLS library.
ENV RUSTFLAGS="-C target-feature=-crt-static"

WORKDIR /app

COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src ./src

# rust-toolchain.toml is honored by rustup only; the standalone installer's
# cargo ignores it, so --locked plus the pinned installer above guarantee the
# 1.98.0 toolchain and the checked-in lockfile.
RUN cargo build --release --locked

# The runtime image carries no package manager, python, or curl: apk-tools is
# removed after the install below, and its database stays for scanners.
FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS runtime

# libgcc is the binary's one dynamic dependency besides musl (libgcc_s for
# panics). ca-certificates is the trust store for outbound TLS.
# busybox (in the base) provides the shell. GNU wget serves the ECS container
# health command (`sh -c 'wget -qO /dev/null http://localhost:8080/health'`,
# exercised by scripts/smoke-image.sh): busybox wget only tries the first
# address `localhost` resolves to, ::1, where the gateway does not listen.
# uid/gid 10001 preserves the upstream gateway image's identity.
RUN apk upgrade --no-cache && \
    apk add --no-cache libgcc ca-certificates wget && \
    addgroup -S -g 10001 gateway && \
    adduser -S -D -H -u 10001 -G gateway -h /home/gateway -s /sbin/nologin gateway && \
    apk del --no-cache apk-tools

COPY --from=builder /app/target/release/ai-gateway /usr/local/bin/ai-gateway
ARG BUILD_ID
ENV BUILD_ID=$BUILD_ID

# The gateway handles SIGTERM itself with a bounded drain (see
# scripts/smoke-image.sh), so no init process is needed.
USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/ai-gateway"]
