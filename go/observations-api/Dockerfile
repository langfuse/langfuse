### BUILDER
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Cache dependency downloads separately from source changes.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/observations-api ./cmd/server

### RUNNER
FROM gcr.io/distroless/static-debian12:nonroot AS runner

COPY --from=builder /out/observations-api /usr/bin/observations-api

ENV PORT=3210
EXPOSE 3210
USER nonroot

# The binary doubles as its own health probe (no shell/curl in distroless).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/usr/bin/observations-api", "healthcheck"]

ENTRYPOINT ["/usr/bin/observations-api"]
