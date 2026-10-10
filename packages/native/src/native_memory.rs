//! V8 accounting that follows Rust ownership, including in-flight libuv tasks.

use std::sync::{
    atomic::{AtomicI64, Ordering},
    Arc,
};

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Env, Result, Status};

type MemoryAdjuster = ThreadsafeFunction<i64, (), (), Status, false, true>;

pub(crate) struct NativeMemory {
    bytes: AtomicI64,
    adjust: Arc<MemoryAdjuster>,
}

impl NativeMemory {
    pub(crate) fn new(env: &Env, bytes: usize) -> Result<Self> {
        let adjust = memory_adjuster(env)?;
        let bytes = bytes as i64;
        let total = env.adjust_external_memory(bytes)?;
        tracing::trace!(delta = bytes, total, "V8 external memory adjusted");
        metrics::gauge!("langfuse.native.otel_media.retained_bytes").increment(bytes as f64);
        Ok(Self {
            bytes: AtomicI64::new(bytes),
            adjust,
        })
    }

    pub(crate) fn resize(&self, bytes: usize) {
        let bytes = bytes as i64;
        let previous = self.bytes.swap(bytes, Ordering::AcqRel);
        self.adjust(bytes - previous);
    }

    pub(crate) fn release(&self, bytes: usize) {
        let bytes = bytes as i64;
        let previous = self.bytes.fetch_sub(bytes, Ordering::AcqRel);
        debug_assert!(previous >= bytes);
        self.adjust(-bytes);
    }

    fn adjust(&self, delta: i64) {
        if delta == 0 {
            return;
        }
        metrics::gauge!("langfuse.native.otel_media.retained_bytes").increment(delta as f64);
        // Closing is expected once the environment stops accepting callbacks.
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
        let bytes = self.bytes.swap(0, Ordering::AcqRel);
        self.adjust(-bytes);
    }
}

fn memory_adjuster(env: &Env) -> Result<Arc<MemoryAdjuster>> {
    // Share one adjuster per environment; worker threads must not retain or call Env directly.
    if let Some(adjust) = env.get_instance_data::<Arc<MemoryAdjuster>>()? {
        return Ok(Arc::clone(adjust));
    }

    // A weak callback does not keep Node alive. It marshals adjustments onto the
    // JS thread even when the last Rust owner is dropped on a worker thread.
    let callback = env.create_function_from_closure::<(), (), _>("nativeMemory", |_| Ok(()))?;
    let adjust = Arc::new(
        callback
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
            })?,
    );
    env.set_instance_data(Arc::clone(&adjust), (), |context| {
        drop(context.value);
    })?;
    Ok(adjust)
}
