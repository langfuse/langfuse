//! Smooth-kNN distance calibration — Stage 2's `rho` / `sigma` per point.
//!
//! Mirrors umap-learn 0.5.12 `smooth_knn_dist` (umap/umap_.py:153) with
//! `local_connectivity = 1.0`, `bandwidth = 1.0`: `rho_i` is the distance to
//! the nearest non-identical neighbour; `sigma_i` is found by 64-iteration
//! binary search so the fuzzy set's cardinality hits `log2(k)`, with
//! `MIN_K_DIST_SCALE`-scaled mean-distance floors. The numba reference keeps
//! `psum`/`lo`/`mid`/`hi` in float32 and starts `hi` at float32 MAX (not
//! infinity) — both mirrored here so values track the oracle closely.

use crate::fmath::HostInvariant;
const SMOOTH_K_TOLERANCE: f64 = 1e-5;
const MIN_K_DIST_SCALE: f32 = 1e-3;

/// Per-point calibration outputs, both length `n`.
pub struct SmoothKnn {
    pub sigmas: Vec<f32>,
    pub rhos: Vec<f32>,
}

/// `knn_dists` is row-major `n × k`, each row sorted ascending (self first
/// unless a lower-indexed duplicate won the tie — distance 0 either way).
pub fn smooth_knn(knn_dists: &[f32], k: usize) -> SmoothKnn {
    let n = knn_dists.len() / k;
    let target = (k as f64).log2(); // bandwidth = 1.0
    let mean_all = mean(knn_dists);
    let mut sigmas = vec![0.0_f32; n];
    let mut rhos = vec![0.0_f32; n];

    for i in 0..n {
        let row = &knn_dists[i * k..(i + 1) * k];

        // local_connectivity = 1.0 ⇒ rho = first non-zero distance (rows are
        // sorted); all-zero rows leave rho at 0
        rhos[i] = row.iter().copied().find(|&d| d > 0.0).unwrap_or(0.0);

        // binary search for sigma — float32 state, hi seeded at f32::MAX,
        // doubling until bracketed, exactly as the reference
        let (mut lo, mut hi, mut mid) = (0.0_f32, f32::MAX, 1.0_f32);
        for _ in 0..64 {
            let mut psum = 0.0_f32;
            // skips position 0 (the d=0 self/duplicate slot)
            for &d in &row[1..] {
                let d = d - rhos[i];
                if d > 0.0 {
                    psum += (-(d / mid)).hi_exp();
                } else {
                    psum += 1.0;
                }
            }
            if (f64::from(psum) - target).abs() < SMOOTH_K_TOLERANCE {
                break;
            }
            if f64::from(psum) > target {
                hi = mid;
                mid = (lo + hi) / 2.0;
            } else {
                lo = mid;
                if hi >= f32::MAX {
                    mid *= 2.0;
                } else {
                    mid = (lo + hi) / 2.0;
                }
            }
        }
        sigmas[i] = mid;

        // MIN_K_DIST_SCALE floors: per-row mean when the point has any
        // non-identical neighbour, global mean otherwise
        let floor = if rhos[i] > 0.0 {
            MIN_K_DIST_SCALE * mean(row)
        } else {
            MIN_K_DIST_SCALE * mean_all
        };
        if sigmas[i] < floor {
            sigmas[i] = floor;
        }
    }
    SmoothKnn { sigmas, rhos }
}

fn mean(values: &[f32]) -> f32 {
    (values.iter().map(|&v| f64::from(v)).sum::<f64>() / values.len() as f64) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(actual: &[f32], expected: &[f32]) {
        for (i, (&a, &e)) in actual.iter().zip(expected).enumerate() {
            assert!(
                (f64::from(a) - f64::from(e)).abs() < 1e-5,
                "index {i}: actual {a} vs expected {e}"
            );
        }
    }

    /// Oracle: umap-learn 0.5.12 smooth_knn_dist on 3 line points (0, 1, 3),
    /// k=3 — values generated 2026-06-06 from the pinned reference. The
    /// sigma literals are exact decimal expansions of the float32 binary
    /// search results — full precision is the point.
    #[test]
    #[allow(clippy::excessive_precision)]
    fn matches_reference_on_line_points() {
        let dists = [0.0, 1.0, 3.0, 0.0, 1.0, 2.0, 0.0, 2.0, 3.0];
        let out = smooth_knn(&dists, 3);
        assert_close(&out.rhos, &[1.0, 1.0, 2.0]);
        assert_close(
            &out.sigmas,
            &[3.72998046875, 1.864990234375, 1.864990234375],
        );
    }

    /// All-identical points: rho stays 0, the search hits the log2(k) target
    /// on the first probe (psum = k−1 = target), and the floor path uses the
    /// global mean (also 0) — sigma = 1.0 exactly, per the reference.
    #[test]
    fn all_zero_distances_yield_unit_sigma() {
        let dists = [0.0, 0.0, 0.0, 0.0];
        let out = smooth_knn(&dists, 2);
        assert_close(&out.rhos, &[0.0, 0.0]);
        assert_close(&out.sigmas, &[1.0, 1.0]);
    }
}
