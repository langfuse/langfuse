use bytes::{Buf, Bytes, BytesMut};
use std::cell::Cell;
use std::mem;

#[derive(Default)]
pub(crate) struct BytesExt {
    bytes: Bytes,

    // Points to the real start of the remaining slice.
    // `Cell` allows us to mutate this value while keeping references to `bytes`.
    // Also, the dedicated counter is faster than using `Bytes::advance()`.
    cursor: Cell<usize>,
}

impl BytesExt {
    /// Returns a remaining slice of bytes.
    #[inline(always)]
    pub(crate) fn slice(&self) -> &[u8] {
        &self.bytes[self.cursor.get()..]
    }

    /// Returns the number of remaining bytes.
    #[inline(always)]
    pub(crate) fn remaining(&self) -> usize {
        self.bytes.len() - self.cursor.get()
    }

    /// Overrides the number of remaining bytes by moving the cursor.
    /// Note: it's valid to call this method while holding `slice()` reference.
    #[inline(always)]
    pub(crate) fn set_remaining(&self, n: usize) {
        self.cursor.set(self.bytes.len() - n);
    }

    #[inline(always)]
    pub(crate) fn advance(&mut self, n: usize) {
        debug_assert!(n <= self.remaining());
        *self.cursor.get_mut() += n;
    }

    /// Adds the provided chunk into available bytes.
    #[inline(always)]
    pub(crate) fn extend(&mut self, chunk: Bytes) {
        if self.bytes.is_empty() {
            self.bytes = chunk;
            self.cursor.set(0);
        } else {
            self.extend_slow(chunk);
        }
    }

    #[cold]
    #[inline(never)]
    fn extend_slow(&mut self, chunk: Bytes) {
        let mut remaining = mem::take(&mut self.bytes);
        remaining.advance(self.cursor.get());

        // Try to reuse the capacity, if possible.
        let mut remaining = BytesMut::from(remaining);
        remaining.extend_from_slice(&chunk);

        self.bytes = remaining.freeze();
        self.cursor.set(0);
    }
}

impl Buf for BytesExt {
    #[inline(always)]
    fn remaining(&self) -> usize {
        self.remaining()
    }

    #[inline(always)]
    fn chunk(&self) -> &[u8] {
        self.slice()
    }

    #[inline(always)]
    fn advance(&mut self, cnt: usize) {
        self.advance(cnt);
    }
}

#[cfg(test)]
mod tests_miri {
    use super::*;

    #[test]
    fn smoke() {
        let mut bytes = BytesExt::default();
        assert!(bytes.slice().is_empty());
        assert_eq!(bytes.remaining(), 0);

        // zero cursor, fast path
        bytes.extend(Bytes::from_static(b"hello"));
        assert_eq!(bytes.slice(), b"hello");
        assert_eq!(bytes.remaining(), 5);

        bytes.advance(3);
        assert_eq!(bytes.slice(), b"lo");
        assert_eq!(bytes.remaining(), 2);

        // non-zero cursor, slow path
        bytes.extend(Bytes::from_static(b"l"));
        assert_eq!(bytes.slice(), b"lol");
        assert_eq!(bytes.remaining(), 3);

        bytes.set_remaining(1);
        assert_eq!(bytes.slice(), b"l");
        assert_eq!(bytes.remaining(), 1);

        bytes.advance(1);
        assert_eq!(bytes.remaining(), 0);
        assert_ne!(bytes.cursor.get(), 0);

        // non-zero cursor, but fast path
        bytes.extend(Bytes::from_static(b"l"));
        assert_eq!(bytes.slice(), b"l");
        assert_eq!(bytes.remaining(), 1);
    }
}
