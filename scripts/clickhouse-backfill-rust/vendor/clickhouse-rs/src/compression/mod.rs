#[cfg(feature = "lz4")]
pub(crate) mod lz4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum Compression {
    /// Disables any compression.
    /// Used by default if the `lz4` feature is disabled.
    None,
    /// Uses `LZ4` codec to (de)compress.
    /// Used by default if the `lz4` feature is enabled.
    #[cfg(feature = "lz4")]
    Lz4,
    /// Uses `LZ4HC` codec to compress and `LZ4` to decompress.
    /// High compression levels are useful in networks with low bandwidth.
    /// Affects only `INSERT`s, because others are compressed by the server.
    /// Possible levels: `[1, 12]`. Recommended level range: `[4, 9]`.
    ///
    /// Deprecated: `lz4_flex` doesn't support HC mode yet: [lz4_flex#165].
    ///
    /// [lz4_flex#165]: https://github.com/PSeitz/lz4_flex/issues/165
    #[cfg(feature = "lz4")]
    #[deprecated(note = "use `Compression::Lz4` instead")]
    Lz4Hc(i32),
}

impl Default for Compression {
    #[cfg(feature = "lz4")]
    #[inline]
    fn default() -> Self {
        if cfg!(feature = "test-util") {
            Compression::None
        } else {
            Compression::Lz4
        }
    }

    #[cfg(not(feature = "lz4"))]
    #[inline]
    fn default() -> Self {
        Compression::None
    }
}

impl Compression {
    pub(crate) fn is_lz4(&self) -> bool {
        *self != Compression::None
    }
}
