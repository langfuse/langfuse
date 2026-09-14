# Builder image for the "docker" strategy in scripts/build.mjs: cross-compiles
# the addon for a developer's host platform when no Rust toolchain is installed
# locally. The upstream base bundles Zig (the cross-linker that can emit macOS
# and glibc-pinned Linux binaries) and cargo-zigbuild. This layer pins the Rust
# toolchain: scripts/build.mjs passes RUST_VERSION from rust-toolchain.toml so
# the container compiles with the same version as CI and the worker image.
FROM ghcr.io/rust-cross/cargo-zigbuild:0.23.3@sha256:76ed3823d8cd9d8b409b10f9c4cda292b0c8699175ea4c0a2d541775c8184d2b

ARG RUST_VERSION
RUN test -n "$RUST_VERSION" \
    && rustup toolchain install "$RUST_VERSION" --profile minimal --component clippy,rustfmt \
    && rustup default "$RUST_VERSION" \
    && rustup target add --toolchain "$RUST_VERSION" \
      aarch64-apple-darwin x86_64-apple-darwin \
      x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu \
      x86_64-unknown-linux-musl aarch64-unknown-linux-musl

WORKDIR /io
