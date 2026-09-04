FROM rust:1-bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim

COPY --from=builder /build/target/release/gateway-loadgen /usr/local/bin/gateway-loadgen

USER 65532:65532
ENTRYPOINT ["/usr/local/bin/gateway-loadgen"]
