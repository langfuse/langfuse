export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const tracerLib = await import("dd-trace");
    const tracer = tracerLib.default;

    tracer.init({
      logInjection: true,
      runtimeMetrics: true,
    });

    tracer.use("http", {
      hooks: {
        request(span, req) {
          if (span && req) {
            const url = "path" in req ? req.path : req.url;
            if (url) {
              const method = req.method;
              span.setTag("resource.name", method ? `${method} ${url}` : url);
            }
          }
        },
      },
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // await import("./sentry.edge.config");
  }
}
