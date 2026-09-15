FROM rust:1.98-bookworm AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/rust-gateway-benchmark /usr/local/bin/rust-gateway-benchmark

EXPOSE 3200
USER 65532:65532
CMD ["rust-gateway-benchmark"]
