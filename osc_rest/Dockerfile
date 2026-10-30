FROM rust:1.99.1-slim-bookworm AS build

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --locked --release

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/osc-rest /usr/local/bin/osc-rest

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/osc-rest"]
