//! Run owned Rust work on libuv and expose only the completed result to Node.

use napi::bindgen_prelude::*;

pub struct OwnedTask<T> {
    work: Option<Box<dyn FnOnce() -> Result<T> + Send>>,
}

impl<T: Send + ToNapiValue + TypeName + 'static> OwnedTask<T> {
    pub(crate) fn run(work: impl FnOnce() -> Result<T> + Send + 'static) -> AsyncTask<Self> {
        AsyncTask::new(Self {
            work: Some(Box::new(work)),
        })
    }
}

impl<T: Send + ToNapiValue + TypeName + 'static> Task for OwnedTask<T> {
    type Output = T;
    type JsValue = T;

    fn compute(&mut self) -> Result<T> {
        self.work
            .take()
            .ok_or_else(|| Error::from_reason("native task already executed"))?()
    }

    fn resolve(&mut self, _env: Env, output: T) -> Result<T> {
        Ok(output)
    }
}
