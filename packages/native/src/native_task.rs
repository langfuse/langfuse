//! Run owned Rust work on libuv and expose only the completed result to Node.

use napi::bindgen_prelude::*;
use std::panic::{catch_unwind, AssertUnwindSafe};

pub(crate) type NativeResult<T> = Result<T, &'static str>;

pub struct OwnedTask<T> {
    work: Option<Box<dyn FnOnce() -> NativeResult<T> + Send>>,
}

impl<T: Send + ToNapiValue + TypeName + 'static> OwnedTask<T> {
    pub(crate) fn new(work: impl FnOnce() -> NativeResult<T> + Send + 'static) -> Self {
        Self {
            work: Some(Box::new(work)),
        }
    }
}

impl<T: Send + ToNapiValue + TypeName + 'static> Task for OwnedTask<T> {
    type Output = NativeResult<T>;
    type JsValue = T;

    fn compute(&mut self) -> Result<Self::Output> {
        let work = self
            .work
            .take()
            .ok_or_else(|| Error::from_reason("native task already executed"))?;
        // libuv calls compute through an extern-C callback. Unwinding through
        // that boundary aborts Node rather than rejecting the pending promise.
        let result = catch_unwind(AssertUnwindSafe(work))
            .unwrap_or_else(|_| Err(Error::new("ERR_NATIVE_PANIC", "native task panicked")));
        Ok(result)
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<T> {
        // Construct the JS error here so Promise rejection preserves its custom code.
        output.map_err(|error| Error::from(napi::JsError::from(error).into_unknown(env)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_panics_become_errors_before_the_ffi_boundary() {
        let mut task = OwnedTask::<()> {
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
