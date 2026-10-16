# FIPS 140-3 base: UBI 9 builder and ubi9-micro runtime
# The gateway performs no TLS today (plain HTTP; the dependency graph contains
# no openssl or rustls crates), so FIPS readiness here means the whole image
# lifecycle stays on the RHEL platform: the binary is compiled and linked
# against UBI9 glibc, and the runtime carries the CMVP-validated OpenSSL FIPS
# provider, so outbound TLS added later links the system libcrypto.so.3 and
# inherits the validated module, the same pattern the RPM Node uses in
# web/worker. The crypto policy stays at the default until the gateway does TLS.
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
# image. Pinned, checksum-verified static release binary (sha256 from the
# release's `.tar.gz.sha256` assets), so the builder does not compile it.
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
    amd64) about_arch=x86_64; about_sha256=9099a59e820c38a68b9d65f300662a567d56562f9a10f6aa4c7e86c17c2566af ;; \
    arm64) about_arch=aarch64; about_sha256=af5169282fb6f84e13471493f405437e43ac517744c9ae12fbe2cdf0a6f0e5a8 ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    about_dir="cargo-about-0.9.2-${about_arch}-unknown-linux-musl"; \
    curl -fsSL -o /tmp/cargo-about.tar.gz "https://github.com/EmbarkStudios/cargo-about/releases/download/0.9.2/${about_dir}.tar.gz"; \
    echo "${about_sha256}  /tmp/cargo-about.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/cargo-about.tar.gz -C /tmp; \
    install -m 0755 "/tmp/${about_dir}/cargo-about" /usr/local/bin/cargo-about; \
    rm -rf /tmp/cargo-about.tar.gz "/tmp/${about_dir}"

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

RUN cargo build --release --frozen

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
# openssl-libs ships the FIPS provider module (/usr/lib64/ossl-modules/fips.so),
# unlinked by today's binary but required the moment an OpenSSL-dependent
# binary lands, so the validated module is already present. crypto-policies
# provides the system policy OpenSSL reads; ca-certificates is the trust store
# for future outbound TLS. wget serves the ECS container health command
# (`sh -c 'wget -qO /dev/null http://localhost:8080/health'`, exercised by
# scripts/smoke-image.sh); ubi9-micro already provides the shell.
RUN dnf -y --installroot /mnt/rootfs --releasever 9 --setopt=install_weak_deps=0 \
    --setopt=tsflags=nodocs --disableexcludes=all \
    install glibc libgcc ca-certificates crypto-policies openssl-libs wget && \
    dnf --installroot /mnt/rootfs clean all && \
    rm -rf /mnt/rootfs/var/cache /mnt/rootfs/var/log/dnf*

# Bake the non-root user into the rootfs (micro has no shadow-utils). uid/gid
# 10001 preserves the upstream gateway image's identity.
RUN echo "gateway:x:10001:" >> /mnt/rootfs/etc/group && \
    echo "gateway:x:10001:10001::/home/gateway:/sbin/nologin" >> /mnt/rootfs/etc/passwd

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
