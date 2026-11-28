//! Host-invariant transcendental functions.
//!
//! # Why this module exists
//!
//! `f64::powf`, `f64::exp`, `f64::ln` and friends call into the platform's
//! libm. On glibc that is not one implementation — glibc resolves libm symbols
//! through **IFUNC** at load time and selects an AVX2/FMA variant when the CPU
//! offers one. Same binary, same glibc, different instruction path, chosen at
//! runtime by the hardware it happens to land on.
//!
//! That is enough to break this crate's reason for existing. Measured on the
//! 723-row reference corpus through `holomap-clusterer`, with identical source,
//! toolchain and `Cargo.lock`:
//!
//! | regime | Ivy Bridge (no AVX2/FMA) | Skylake (AVX2+FMA) |
//! |---|---|---|
//! | raw | 36 / 30.0% | 36 / 31.4% |
//! | normalised f32 | 37 / 29.2% | 36 / 28.9% |
//! | normalised f64 | 34 / 27.2% | 33 / 27.7% |
//!
//! Masking glibc's dispatch on the Skylake host with
//! `GLIBC_TUNABLES=glibc.cpu.hwcaps=-AVX2,-FMA` reproduces the Ivy Bridge
//! column **exactly**, in all three regimes. Rust-side feature detection
//! (`is_x86_feature_detected!`, which `matrixmultiply` uses) is unaffected by
//! that tunable and was verified to report `avx2=true fma=true` in both runs —
//! so the delta cannot come from there. glibc's libm is what moved.
//!
//! Routing every transcendental through the pure-Rust [`libm`] crate removes
//! the dispatch entirely: one implementation, chosen at compile time, identical
//! on every x86-64 host. There is nothing left to select between.
//!
//! # What is deliberately NOT routed here
//!
//! - **`sqrt`** compiles to the `sqrtsd`/`sqrtss` instruction, which IEEE-754
//!   defines as correctly rounded. There is no libm call and no dispatch, so
//!   wrapping it would cost speed and buy nothing.
//! - **`powi`** is expanded by the compiler into multiplications. Same reason.
//!
//! # This changes the numbers — and it changes them *towards* wasm
//!
//! `libm`'s results are not bit-identical to glibc's, so adopting it moves
//! native output on every host, including hosts the dispatch never affected.
//! That cost is real and is paid once.
//!
//! What makes it the right trade is *where* it lands. `wasm32-unknown-unknown`
//! has no system libm, so the wasm build was already using these same pure-Rust
//! implementations — which is precisely **why** wasm was host-invariant when
//! native was not. Pointing native at the same crate does not invent a third
//! answer; it converges native onto the one that was already reproducible.
//! Measured on the 723-row corpus through `holomap-clusterer`:
//!
//! | regime | wasm (before *and* after) | native before | native after |
//! |---|---|---|---|
//! | raw | 37 / 29.6% | 36 / 30.0% | **37 / 29.6%** |
//! | normalised | 36 / 27.0% | 34 / 27.2% | **36 / 27.0%** |
//!
//! wasm output is unchanged, so wasm consumers see nothing. The cross-backend
//! delta that `npm/test/backend-equivalence-corpus.test.ts` previously reported
//! without bounding is now **zero clusters, zero noise rows** in both regimes.
//! The spread across mathematically-equivalent input regimes also narrowed,
//! from 3 clusters to 1.
//!
//! # The cost, measured rather than assumed
//!
//! `libm`'s pure-Rust `pow` is not free: glibc's dispatch exists because the
//! AVX2/FMA kernels are genuinely faster. On the 1000×50-d bench this crate
//! ships, **3.37 s → 4.55 s, about 1.35×**.
//!
//! Read that as a *lower* bound. It was measured on an Ivy Bridge host with no
//! AVX2 and no FMA — the machine where glibc was already taking its baseline
//! path and had least to offer. On a CPU where glibc would have selected an
//! AVX2 kernel, the gap should be wider. Not yet measured there; do not quote
//! 1.35× as the cross-machine figure.
//!
//! Determinism is this crate's product, so trading throughput for it is the
//! trade the crate exists to make. Stating the number is not a caveat on the
//! decision — it is so nobody rediscovers the slowdown and files it as a bug.

/// Transcendentals that resolve identically on every host.
///
/// Implemented for `f32` and `f64`. Method names are prefixed `hi_`
/// ("host-invariant") so a call site never silently reverts to the inherent
/// `std` method after an edit — `x.exp()` and `x.hi_exp()` do not look alike.
pub(crate) trait HostInvariant {
    /// `self^n` — replaces [`f64::powf`].
    fn hi_powf(self, n: Self) -> Self;
    /// `e^self` — replaces [`f64::exp`].
    fn hi_exp(self) -> Self;
    /// Natural log — replaces [`f64::ln`].
    fn hi_ln(self) -> Self;
    /// Cosine — replaces [`f64::cos`].
    fn hi_cos(self) -> Self;
}

impl HostInvariant for f64 {
    #[inline]
    fn hi_powf(self, n: f64) -> f64 {
        libm::pow(self, n)
    }
    #[inline]
    fn hi_exp(self) -> f64 {
        libm::exp(self)
    }
    #[inline]
    fn hi_ln(self) -> f64 {
        libm::log(self)
    }
    #[inline]
    fn hi_cos(self) -> f64 {
        libm::cos(self)
    }
}

impl HostInvariant for f32 {
    #[inline]
    fn hi_powf(self, n: f32) -> f32 {
        libm::powf(self, n)
    }
    #[inline]
    fn hi_exp(self) -> f32 {
        libm::expf(self)
    }
    #[inline]
    fn hi_ln(self) -> f32 {
        libm::logf(self)
    }
    #[inline]
    fn hi_cos(self) -> f32 {
        libm::cosf(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The wrappers must agree with `std` to a sane tolerance. They are NOT
    /// expected to be bit-identical — that is the entire point of the change,
    /// and asserting equality here would fail on exactly the hosts this module
    /// exists to fix.
    #[test]
    fn agrees_with_std_within_tolerance() {
        for &(x, y) in &[(0.5_f64, 2.0), (1.5, 0.9), (3.0, 1.0), (1e-3, 2.5)] {
            assert!((x.hi_powf(y) - x.powf(y)).abs() < 1e-12, "powf({x}, {y})");
        }
        for &x in &[0.0_f64, -1.0, 1.0, -7.5, 2.5] {
            assert!((x.hi_exp() - x.exp()).abs() < 1e-12, "exp({x})");
            assert!((x.hi_cos() - x.cos()).abs() < 1e-12, "cos({x})");
        }
        for &x in &[1e-9_f64, 0.5, 1.0, 100.0] {
            assert!((x.hi_ln() - x.ln()).abs() < 1e-12, "ln({x})");
        }
    }

    #[test]
    fn f32_agrees_with_std_within_tolerance() {
        for &x in &[0.0_f32, -1.0, 1.0, -7.5] {
            assert!((x.hi_exp() - x.exp()).abs() < 1e-6, "expf({x})");
        }
        assert!((2.0_f32.hi_powf(3.0) - 8.0).abs() < 1e-6);
    }
}
