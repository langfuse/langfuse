# Instrumentation at Langfuse

Throughout our applications we want to use as much Otel as possible. This helps us to be flexible choosing our observability backend, and we will benefit from features and packages built by the Otel community.

## How to use Otel in your application

- Use the `instrument` or `instrument` functions to wrap your functions with Otel instrumentation. This will automatically create spans for your functions and send them to the Otel collector. If an instrumented function throws, exceptions will be added to the span and the span will be marked as failed.
- Use `recordGauge`, `recordCounter`, `recordHistogram` to record metrics. These will be sent to the Otel collector.

## Configuration options

- `web` and `worker` have an instrumentation.ts file, which configures otel for the application.
- For trpc, we use `@baselime/trpc-opentelemetry-middleware` to enrich spans with trpc inputs and outputs.
- When building adding new infrastructure, we should search for auto instumentations for our code base.
