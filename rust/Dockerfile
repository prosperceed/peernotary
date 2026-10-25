# syntax=docker/dockerfile:1
FROM rust:1-bookworm AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release --locked --bin tlsn-service

FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home peernotary

WORKDIR /app
COPY --from=builder /app/target/release/tlsn-service /usr/local/bin/tlsn-service

USER peernotary
ENV HOST=0.0.0.0
ENV PORT=7047
EXPOSE 7047

ENTRYPOINT ["/usr/local/bin/tlsn-service"]

