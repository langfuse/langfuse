//! Run OTEL media work with stage-level native instrumentation.

use std::time::Instant;

use napi::bindgen_prelude::*;

use crate::native_task::{NativeResult, OwnedTask};

const TIMED_MEDIA_OPERATIONS: [&str; 2] = ["validate", "extract"];

pub struct OtelMediaTask<T> {
    operation: &'static str,
    inner: OwnedTask<T>,
}

impl<T: Send + ToNapiValue + TypeName + 'static> OtelMediaTask<T> {
    pub(crate) fn run(
        operation: &'static str,
        work: impl FnOnce() -> NativeResult<T> + Send + 'static,
    ) -> AsyncTask<Self> {
        AsyncTask::new(Self {
            operation,
            inner: OwnedTask::new(work),
        })
    }
}

impl<T: Send + ToNapiValue + TypeName + 'static> Task for OtelMediaTask<T> {
    type Output = NativeResult<T>;
    type JsValue = T;

    fn compute(&mut self) -> Result<Self::Output> {
        let started = TIMED_MEDIA_OPERATIONS
            .contains(&self.operation)
            .then(Instant::now);
        let _span = tracing::debug_span!("otel_media", operation = self.operation).entered();
        let result = self.inner.compute()?;
        if result
            .as_ref()
            .is_err_and(|error| error.status == "ERR_NATIVE_PANIC")
        {
            tracing::error!(operation = self.operation, "native task panicked");
        }
        if let Some(started) = started {
            metrics::counter!("langfuse.native.otel_media.operations",
                "operation" => self.operation,
                "outcome" => result.as_ref().err().map_or("success", |error| error.status)
            )
            .increment(1);
            metrics::histogram!("langfuse.native.otel_media.duration_ms", "operation" => self.operation)
                .record(started.elapsed().as_secs_f64() * 1000.0);
        }
        Ok(result)
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<T> {
        self.inner.resolve(env, output)
    }
}
