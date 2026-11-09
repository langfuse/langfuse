# UBI 9 builder and ubi9-micro runtime, the same platform as web/worker.
# The gateway is not FIPS 140-3 validated. It serves plain HTTP, but its
# outbound HTTPS (provider APIs, OTLP export) uses rustls with the aws-lc-rs
# backend, statically linked in its non-FIPS build. The binary links no system
# libcrypto, and the runtime image ships no OpenSSL. Validated TLS would need
# aws-lc-rs's `fips` feature or an OpenSSL-backed client (which would also need
# openssl-libs added back to the runtime packages).
# The defaults are Red Hat's public UBI9 images, so the build needs no
# credentials. Iron Bank serves the same content from an authenticated registry
# with DoD provenance and scan attestations. Release builds opt in by overriding
# both args after `docker login registry1.dso.mil` (free P1 account plus a CLI
# secret):
#   --build-arg BASE_IMAGE=registry1.dso.mil/ironbank/redhat/ubi/ubi9:9.8
#   --build-arg MICRO_BASE_IMAGE=registry1.dso.mil/ironbank/redhat/ubi/ubi9-micro:9.8
ARG BASE_IMAGE=registry.access.redhat.com/ubi9/ubi:9.8
ARG MICRO_BASE_IMAGE=registry.access.redhat.com/ubi9/ubi-micro:9.8

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS toolchain

ARG TARGETARCH

# gcc provides the linker; tar and gzip unpack the pinned toolchain (curl is
# already present as curl-minimal in the base). Red Hat's UBI9 rust-toolset
# (1.84.1) cannot compile this crate's edition 2024 (needs rustc >= 1.85), and
# the official rust:1.98.0-bookworm image links against Debian's glibc 2.36,
# so binaries built there refuse to run on UBI9 (glibc 2.34). Building on UBI9
# keeps the toolchain and the binary on the FIPS-validated platform.
# No `dnf upgrade`: nothing from this stage but the binary and the license
# notices reaches the runtime image, whose packages are installed fresh by the
# rpm-installer stage. Linking against the base image's glibc also keeps it at
# or below the runtime's version.
RUN dnf -y install --setopt=install_weak_deps=0 gcc tar gzip && \
    dnf clean all

# Pinned standalone Rust 1.98.0 installer, the exact channel from
# rust-toolchain.toml (keep the version in sync with it), checksum-verified
# like the dumb-init binary in web/Dockerfile. rustup-init would fetch the
# rustup binary from an unversioned URL, and only rustc, cargo and the
# target's std are needed to build; docs, clippy and rustfmt stay out of the
# builder image (CI runs fmt and clippy outside Docker).
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
    amd64) triple=x86_64-unknown-linux-gnu; toolchain_sha256=aa30409afa67bd1ada244cefd82c7980e6a65bc113bb978e934b2413c75e3900 ;; \
    arm64) triple=aarch64-unknown-linux-gnu; toolchain_sha256=5fbb4282403046d52a4672765c6761a809bf9f33e699b17e6eb7a93ab7770cc3 ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/rust.tar.gz "https://static.rust-lang.org/dist/rust-1.98.0-${triple}.tar.gz"; \
    echo "${toolchain_sha256}  /tmp/rust.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/rust.tar.gz -C /tmp; \
    /tmp/rust-1.98.0-${triple}/install.sh --prefix=/usr/local \
    --components=rustc,cargo,rust-std-${triple}; \
    rm -rf /tmp/rust.tar.gz /tmp/rust-1.98.0-${triple}

# cargo-about renders the third-party license notices shipped in the runtime
# image. cargo-auditable embeds the resolved dependency list in the binary so
# image scanners (Trivy, Grype, Docker Scout) can match its Rust crates against
# advisories; a stripped binary otherwise shows them nothing. Both build from
# crates.io at pinned versions with their own lockfiles; keep the versions in
# sync with worker/Dockerfile.
RUN cargo install --locked --root /usr/local --features cli cargo-about@0.9.2 && \
    cargo install --locked --root /usr/local cargo-auditable@0.7.7 && \
    rm -rf "${CARGO_HOME:-$HOME/.cargo}/registry"

FROM --platform=${TARGETPLATFORM:-linux/amd64} toolchain AS deps

WORKDIR /app

# Fetch the locked dependency sources against empty targets, so this layer and
# everything built on it stay cached until Cargo.toml or Cargo.lock change.
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && touch src/lib.rs && \
    cargo fetch --locked

FROM --platform=${TARGETPLATFORM:-linux/amd64} deps AS builder

# rust-toolchain.toml is honored by rustup only; the standalone installer's
# cargo ignores it, so --frozen (the checked-in lockfile, sources from the
# fetch above) plus the pinned installer guarantee the 1.98.0 toolchain.
# Dependencies compile once against the stub targets; source-only changes
# rebuild just the crate. `cargo clean -p` drops the stub's own artifacts so
# the real sources always rebuild regardless of their mtimes.
RUN cargo build --release --frozen && \
    cargo clean --release --frozen -p ai-gateway && \
    rm -rf src

COPY src ./src

RUN cargo auditable build --release --frozen

# Runs in parallel with the compile. `--frozen` reads licenses only from the
# fetched crate sources, and `generate` fails on any dependency whose license
# about.toml does not accept.
FROM --platform=${TARGETPLATFORM:-linux/amd64} deps AS licenses

COPY about.toml about.hbs ./
RUN cargo about generate --frozen --fail about.hbs -o THIRD_PARTY_LICENSES.txt

# Runtime rootfs assembled with dnf --installroot and layered onto ubi9-micro:
# the final image carries no package manager, python, or curl. It holds only
# the packages listed below plus their deps, with an intact rpmdb for scanners.
# --disableexcludes=all: the Iron Bank base excludes filesystem-* in
# /etc/dnf/dnf.conf (it protects its own rootfs during in-place upgrades),
# which would also block installing the dir-skeleton package into a fresh
# installroot.
FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS rpm-installer

# glibc and libgcc are the binary's dynamic dependencies (libgcc_s for panics).
# ca-certificates is the trust store rustls reads for outbound TLS. wget serves
# the ECS container health command
# (`sh -c 'wget -qO /dev/null http://localhost:8080/health'`, exercised by
# scripts/smoke-image.sh); ubi9-micro already provides the shell. crypto-policies
# is the system policy wget's GnuTLS reads. coreutils-single satisfies the
# packages' `coreutils` requirement, which dnf would otherwise resolve to the
# much larger full coreutils (same pin as worker/Dockerfile).
RUN dnf -y --installroot /mnt/rootfs --releasever 9 --setopt=install_weak_deps=0 \
    --setopt=tsflags=nodocs --disableexcludes=all \
    install glibc libgcc coreutils-single ca-certificates crypto-policies wget && \
    dnf --installroot /mnt/rootfs clean all && \
    rm -rf /mnt/rootfs/var/cache /mnt/rootfs/var/log/dnf*

# Bake the non-root user into the rootfs (micro has no shadow-utils). uid/gid
# 10001 preserves the upstream gateway image's identity.
RUN echo "gateway:x:10001:" >> /mnt/rootfs/etc/group && \
    echo "gateway:x:10001:10001::/home/gateway:/sbin/nologin" >> /mnt/rootfs/etc/passwd

# The UBI EULA requires every image derived from UBI to include it unmodified.
# The magic-byte check rejects an HTML error page served in its place.
# Keep in sync with web/Dockerfile and worker/Dockerfile.
RUN mkdir -p /mnt/rootfs/usr/share/licenses/redhat-ubi && \
    curl -fsSL --retry 5 --retry-all-errors -o /mnt/rootfs/usr/share/licenses/redhat-ubi/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf \
    https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf && \
    head -c 5 /mnt/rootfs/usr/share/licenses/redhat-ubi/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf | grep -qx '%PDF-'

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${MICRO_BASE_IMAGE} AS runtime

COPY --from=rpm-installer /mnt/rootfs /
COPY --from=builder /app/target/release/ai-gateway /usr/local/bin/ai-gateway
COPY --from=licenses /app/THIRD_PARTY_LICENSES.txt /usr/share/licenses/ai-gateway/THIRD_PARTY_LICENSES.txt
ARG BUILD_ID
ENV BUILD_ID=$BUILD_ID

# The gateway handles SIGTERM itself with a bounded drain (see
# scripts/smoke-image.sh), so no init process is needed.
USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/ai-gateway"]
