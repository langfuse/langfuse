FROM rust:1.98.0-bookworm AS builder
RUN useradd --create-home --uid 10001 gateway && mkdir /app && chown gateway:gateway /app
WORKDIR /app
ENV CARGO_HOME=/home/gateway/.cargo
USER gateway
COPY --chown=gateway:gateway Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY --chown=gateway:gateway src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/ai-gateway /usr/local/bin/ai-gateway
USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/ai-gateway"]
