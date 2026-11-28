//! The low-dimensional membership curve `1 / (1 + a·x^{2b})` — fitting
//! `(a, b)` from `(min_dist, spread)`.
//!
//! Mirrors umap-learn's `find_ab_params`: the target is the offset
//! exponential `y = 1` for `x < min_dist`, `exp(−(x − min_dist)/spread)`
//! beyond, sampled on `linspace(0, 3·spread, 300)`; the fit is least-squares
//! (Levenberg-Marquardt here — scipy's `curve_fit` uses the same family).
//! Fully deterministic: fixed grid, fixed starting point, fixed iteration
//! schedule.

use crate::fmath::HostInvariant;
/// Fit `(a, b)` for the membership curve from `min_dist` and `spread`.
pub fn find_ab_params(spread: f64, min_dist: f64) -> (f64, f64) {
    const N: usize = 300;
    let mut xs = [0.0_f64; N];
    let mut ys = [0.0_f64; N];
    for (i, (x, y)) in xs.iter_mut().zip(ys.iter_mut()).enumerate() {
        *x = 3.0 * spread * i as f64 / (N - 1) as f64;
        *y = if *x < min_dist {
            1.0
        } else {
            (-(*x - min_dist) / spread).hi_exp()
        };
    }

    // Levenberg-Marquardt on f(x) = 1/(1 + a·x^{2b}), fixed start (1, 1)
    let (mut a, mut b) = (1.0_f64, 1.0_f64);
    let mut lambda = 1e-3;
    let sse = |a: f64, b: f64| -> f64 {
        xs.iter()
            .zip(&ys)
            .map(|(&x, &y)| (model(x, a, b) - y).powi(2))
            .sum()
    };
    let mut err = sse(a, b);
    for _ in 0..200 {
        // accumulate J^T J (2×2) and J^T r
        let (mut jaa, mut jab, mut jbb, mut ga, mut gb) = (0.0, 0.0, 0.0, 0.0, 0.0);
        for (&x, &y) in xs.iter().zip(&ys) {
            let xp = if x > 0.0 { x.hi_powf(2.0 * b) } else { 0.0 };
            let denom = 1.0 + a * xp;
            let r = 1.0 / denom - y;
            let da = -xp / (denom * denom);
            let db = if x > 0.0 {
                -2.0 * a * xp * x.hi_ln() / (denom * denom)
            } else {
                0.0
            };
            jaa += da * da;
            jab += da * db;
            jbb += db * db;
            ga += da * r;
            gb += db * r;
        }
        // solve (J^T J + λ·diag) δ = −J^T r
        let (maa, mbb) = (jaa * (1.0 + lambda), jbb * (1.0 + lambda));
        let det = maa * mbb - jab * jab;
        if det.abs() < 1e-300 {
            break;
        }
        let (delta_a, delta_b) = ((-ga * mbb + gb * jab) / det, (-gb * maa + ga * jab) / det);
        let (na, nb) = (a + delta_a, b + delta_b);
        let new_err = if na > 0.0 && nb > 0.0 {
            sse(na, nb)
        } else {
            f64::INFINITY
        };
        if new_err < err {
            (a, b) = (na, nb);
            err = new_err;
            lambda = (lambda * 0.5).max(1e-12);
            if delta_a.abs() < 1e-12 && delta_b.abs() < 1e-12 {
                break;
            }
        } else {
            lambda *= 2.0;
            if lambda > 1e12 {
                break;
            }
        }
    }
    (a, b)
}

#[inline]
fn model(x: f64, a: f64, b: f64) -> f64 {
    if x > 0.0 {
        1.0 / (1.0 + a * x.hi_powf(2.0 * b))
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Oracles from umap-learn 0.5.12 `find_ab_params` (scipy curve_fit),
    /// generated 2026-06-07. Agreement to 1e-3 is plenty: downstream the
    /// params shape a smooth gradient curve, and scipy itself only promises
    /// a local least-squares optimum.
    #[test]
    fn matches_reference_anchors() {
        let cases = [
            (1.0, 0.1, 1.5769434606499164, 0.8950608782021184),
            (1.0, 0.0, 1.9328083980052901, 0.7904949736958765),
            (1.0, 0.5, 0.5830300204456109, 1.3341669924903796),
            (2.0, 0.25, 0.416273496854413, 0.9218551322721804),
        ];
        for (spread, min_dist, a_ref, b_ref) in cases {
            let (a, b) = find_ab_params(spread, min_dist);
            assert!(
                (a - a_ref).abs() < 1e-3,
                "spread={spread} min_dist={min_dist}: a={a} vs {a_ref}"
            );
            assert!(
                (b - b_ref).abs() < 1e-3,
                "spread={spread} min_dist={min_dist}: b={b} vs {b_ref}"
            );
        }
    }

    #[test]
    fn fit_is_deterministic() {
        let p1 = find_ab_params(1.0, 0.1);
        let p2 = find_ab_params(1.0, 0.1);
        assert_eq!(p1, p2);
    }
}
