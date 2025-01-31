# otlp-proto

This directory contains compiled opentelemetry protobuf files.
Those should correspond to the definitions in https://github.com/open-telemetry/opentelemetry-proto/tree/v1.5.0 and are copied
from the generated contents of https://www.npmjs.com/package/@opentelemetry/otlp-transformer.
The file was converted from `.js` to `.ts` and the `export` statements were modified to make them Next.js compatible.

Unless there are relevant updates to the OpenTelemetry specification, there should be no need to ever touch this.
