//! Run owned Rust work on libuv and expose only the completed result to Node.

use napi::bindgen_prelude::*;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::Instant;

pub(crate) type NativeResult<T> = Result<T, &'static str>;

pub struct OwnedTask<T> {
    operation: &'static str,
    work: Option<Box<dyn FnOnce() -> NativeResult<T> + Send>>,
}

impl<T: Send + ToNapiValue + TypeName + 'static> OwnedTask<T> {
    pub(crate) fn run(
        operation: &'static str,
        work: impl FnOnce() -> NativeResult<T> + Send + 'static,
    ) -> AsyncTask<Self> {
        AsyncTask::new(Self {
            operation,
            work: Some(Box::new(work)),
        })
    }
}

impl<T: Send + ToNapiValue + TypeName + 'static> Task for OwnedTask<T> {
    type Output = NativeResult<T>;
    type JsValue = T;

    fn compute(&mut self) -> Result<Self::Output> {
        // Per-body reads can run thousands of times per batch. The pipeline
        // stages own timing/count metrics; TS owns media upload outcomes.
        let started = matches!(self.operation, "validate" | "extract").then(Instant::now);
        let _span = tracing::debug_span!("otel_media", operation = self.operation).entered();
        let work = self
            .work
            .take()
            .ok_or_else(|| Error::from_reason("native task already executed"))?;
        // libuv calls compute through an extern-C callback. Unwinding through
        // that boundary aborts Node rather than rejecting the pending promise.
        let result = catch_unwind(AssertUnwindSafe(work)).unwrap_or_else(|_| {
            tracing::error!(operation = self.operation, "native task panicked");
            Err(Error::new("ERR_NATIVE_PANIC", "native task panicked"))
        });
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
        // Custom error codes are constructed on the JS thread and survive the
        // rejection unchanged, so callers never classify failures by prose.
        output.map_err(|error| Error::from(napi::JsError::from(error).into_unknown(env)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_panics_become_errors_before_the_ffi_boundary() {
        let mut task = OwnedTask::<()> {
            operation: "test",
            work: Some(Box::new(|| panic!("invalid internal state"))),
        };
        let error = task
            .compute()
            .unwrap()
            .expect_err("panic must reject the task");
        assert_eq!(error.status, "ERR_NATIVE_PANIC");
        assert_eq!(error.reason, "native task panicked");
    }
}
