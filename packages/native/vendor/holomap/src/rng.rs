//! The crate's single source of randomness: one seeded PCG64 stream.
//!
//! Every random draw in the whole pipeline — spectral-init noise, random
//! init, SGD negative sampling — comes through this wrapper, in a fixed
//! call order. That is the determinism contract's foundation: same seed,
//! same stream, same everything. There is no constructor from OS entropy.

use crate::fmath::HostInvariant;
use rand::Rng as _;
use rand::SeedableRng as _;
use rand_pcg::Pcg64;

pub struct SeededRng {
    inner: Pcg64,
}

impl SeededRng {
    pub fn new(seed: u64) -> Self {
        Self {
            inner: Pcg64::seed_from_u64(seed),
        }
    }

    /// Uniform draw in `[low, high)`.
    pub fn uniform(&mut self, low: f32, high: f32) -> f32 {
        low + (high - low) * self.inner.random::<f32>()
    }

    /// Uniform index in `[0, n)` — negative-sampling draws.
    pub fn next_index(&mut self, n: usize) -> usize {
        (self.inner.random::<u32>() as usize) % n
    }

    /// Standard-normal draw scaled by `scale` (Box-Muller; no extra deps).
    pub fn normal(&mut self, scale: f32) -> f32 {
        // draw in f64 for the log/sqrt, emit f32 — u1 nudged away from 0
        let u1: f64 = f64::from(self.inner.random::<f32>()).max(f64::MIN_POSITIVE);
        let u2: f64 = f64::from(self.inner.random::<f32>());
        let z = (-2.0 * u1.hi_ln()).sqrt() * (std::f64::consts::TAU * u2).hi_cos();
        scale * z as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_stream() {
        let mut a = SeededRng::new(42);
        let mut b = SeededRng::new(42);
        for _ in 0..100 {
            assert_eq!(a.uniform(-10.0, 10.0), b.uniform(-10.0, 10.0));
            assert_eq!(a.normal(1e-4), b.normal(1e-4));
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let mut a = SeededRng::new(42);
        let mut b = SeededRng::new(43);
        let draws_a: Vec<f32> = (0..8).map(|_| a.uniform(0.0, 1.0)).collect();
        let draws_b: Vec<f32> = (0..8).map(|_| b.uniform(0.0, 1.0)).collect();
        assert_ne!(draws_a, draws_b);
    }

    #[test]
    fn draws_respect_bounds_and_scale() {
        let mut r = SeededRng::new(7);
        for _ in 0..1000 {
            let u = r.uniform(-10.0, 10.0);
            assert!((-10.0..10.0).contains(&u));
        }
        // 1e-4-scaled normals stay tiny (|z| < 6 sigma in 1k draws)
        for _ in 0..1000 {
            assert!(r.normal(1e-4).abs() < 6e-4);
        }
    }
}
