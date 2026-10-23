# Build the pinned community release from official source; its registry image is unavailable.
FROM golang:1.24-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
RUN git init . \
    && git remote add origin https://github.com/minio/minio.git \
    && git fetch --depth 1 origin 07c3a429bfed433e49018cb0f78a52145d4bedeb \
    && git checkout --detach FETCH_HEAD
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -p 2 -trimpath \
    -ldflags="$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go 2025-09-07T16:13:09Z)" \
    -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /licenses/LICENSE
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
