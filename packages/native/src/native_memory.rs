//! V8 accounting that follows Rust ownership, including in-flight libuv tasks.

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Env, Result, Status};

pub(crate) struct NativeMemory {
    bytes: i64,
    adjust: ThreadsafeFunction<i64, (), (), Status, false, true>,
}

impl NativeMemory {
    pub(crate) fn new(env: &Env, bytes: usize) -> Result<Self> {
        // A weak callback does not keep Node alive. N-API owns its environment
        // and marshals adjustments onto the JS thread, even when the last Rust
        // owner is released by a worker or a task fails before it is scheduled.
        let callback = env.create_function_from_closure::<(), (), _>("nativeMemory", |_| Ok(()))?;
        let adjust = callback
            .build_threadsafe_function::<i64>()
            .weak::<true>()
            .build_callback(|context| {
                // Accounting failure must never turn a cleanup callback into
                // an uncaught JavaScript exception.
                match context.env.adjust_external_memory(context.value) {
                    Ok(total) => {
                        tracing::trace!(delta = context.value, total, "V8 external memory adjusted")
                    }
                    Err(error) => {
                        tracing::warn!(%error, "native external-memory adjustment failed")
                    }
                }
                Ok(())
            })?;
        let bytes = bytes as i64;
        let total = env.adjust_external_memory(bytes)?;
        tracing::trace!(delta = bytes, total, "V8 external memory adjusted");
        metrics::gauge!("langfuse.native.otel_media.retained_bytes").increment(bytes as f64);
        Ok(Self { bytes, adjust })
    }

    pub(crate) fn resize(&mut self, bytes: usize) {
        let delta = bytes as i64 - self.bytes;
        self.bytes = bytes as i64;
        self.adjust(delta);
    }

    fn adjust(&self, delta: i64) {
        if delta == 0 {
            return;
        }
        metrics::gauge!("langfuse.native.otel_media.retained_bytes").increment(delta as f64);
        // The queue is unbounded and receives only stage transitions and final
        // release, never an entry per media item. Closing means Node is exiting.
        let status = self
            .adjust
            .call(delta, ThreadsafeFunctionCallMode::NonBlocking);
        if status != Status::Ok && status != Status::Closing {
            tracing::warn!(?status, "native external-memory adjustment failed");
        }
    }
}

impl Drop for NativeMemory {
    fn drop(&mut self) {
        self.adjust(-self.bytes);
    }
}
