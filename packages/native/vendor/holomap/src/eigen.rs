//! Smallest eigenpairs of the normalized Laplacian.
//!
//! Two paths, same contract: `N ≤ 2000` materializes the Laplacian and uses
//! nalgebra's `SymmetricEigen` (Decision: nalgebra is a required dep — pure
//! Rust, deterministic, no BLAS/LAPACK/C); above that, Lanczos with full
//! reorthogonalization runs on the shifted operator `B = 2I − L`, whose
//! LARGEST eigenvalues are L's smallest (the normalized Laplacian's spectrum
//! lives in [0, 2]).
//!
//! Determinism: the Lanczos start vector is FIXED — normalized all-ones
//! perturbed by a Knuth-hash pseudo-noise pattern (seed-independent, no RNG;
//! the bare all-ones vector can coincide with the trivial eigenvector on
//! regular graphs, which would stall the Krylov space). Same graph → same
//! start → same iteration → same eigenpairs, on every run and every seed.

use crate::sparse::Laplacian;

/// Below/at this size the dense path runs; above it, Lanczos.
const DENSE_THRESHOLD: usize = 2000;

/// `k` smallest eigenpairs, eigenvalues ascending; `vectors` is column-major
/// `n × k`.
pub struct EigenPairs {
    /// Eigenvalues, ascending. The init path only consumes `vectors`; the
    /// values are read by the parity tests (and kept for diagnostics).
    #[allow(dead_code)]
    pub values: Vec<f64>,
    pub vectors: Vec<f64>,
}

pub fn smallest_eigenpairs(lap: &Laplacian, k: usize) -> EigenPairs {
    if lap.n() <= DENSE_THRESHOLD {
        dense_eigenpairs(lap, k)
    } else {
        lanczos_eigenpairs(lap, k)
    }
}

/// Test-only handle to force the Lanczos path below the dense threshold.
#[cfg(test)]
pub fn lanczos_eigenpairs_for_test(lap: &Laplacian, k: usize) -> EigenPairs {
    lanczos_eigenpairs(lap, k)
}

fn dense_eigenpairs(lap: &Laplacian, k: usize) -> EigenPairs {
    let n = lap.n();
    let m = nalgebra::DMatrix::from_column_slice(n, n, &lap.to_dense());
    let eig = m.symmetric_eigen();

    let mut order: Vec<usize> = (0..n).collect();
    order.sort_unstable_by(|&a, &b| eig.eigenvalues[a].total_cmp(&eig.eigenvalues[b]));

    let mut values = Vec::with_capacity(k);
    let mut vectors = vec![0.0_f64; n * k];
    for (j, &col) in order.iter().take(k).enumerate() {
        values.push(eig.eigenvalues[col]);
        let v = &mut vectors[j * n..(j + 1) * n];
        for (i, x) in v.iter_mut().enumerate() {
            *x = eig.eigenvectors[(i, col)];
        }
        canonical_sign(v);
    }
    EigenPairs { values, vectors }
}

/// Deterministic pseudo-noise in [0, 1) — Knuth multiplicative hash. Used to
/// perturb Lanczos start/restart vectors without touching any RNG stream.
fn hash01(i: usize, salt: u32) -> f64 {
    let h = (i as u32).wrapping_add(salt).wrapping_mul(2654435761);
    f64::from(h >> 8) / f64::from(1_u32 << 24)
}

/// Canonical sign: the maximum-|entry| component (lowest index on ties) is
/// made positive, so eigenvector orientation is reproducible across paths
/// and platforms.
fn canonical_sign(v: &mut [f64]) {
    let mut pivot = 0;
    for (i, x) in v.iter().enumerate() {
        if x.abs() > v[pivot].abs() + 1e-15 {
            pivot = i;
        }
    }
    if v[pivot] < 0.0 {
        for x in v.iter_mut() {
            *x = -*x;
        }
    }
}

/// Lanczos with locking and warm restarts on `B = 2I − L`. Converged Ritz
/// vectors are locked (deflated out of later cycles); each new cycle's
/// Krylov space starts from the best unconverged Ritz vector. Everything is
/// deterministic: fixed start vector, fixed iteration counts, fixed
/// orthogonalization order.
fn lanczos_eigenpairs(lap: &Laplacian, k: usize) -> EigenPairs {
    let n = lap.n();
    let m = n.min((8 * k).max(60)); // per-cycle Krylov dimension
    const LOCK_TOL: f64 = 1e-10;
    const MAX_CYCLES: usize = 200;

    let mut locked: Vec<(f64, Vec<f64>)> = Vec::with_capacity(k);
    let mut tmp = vec![0.0_f64; n];

    // fixed start vector: all-ones + 1% hash perturbation — seed-independent
    // and never exactly the trivial eigenvector
    let mut r: Vec<f64> = (0..n).map(|i| 1.0 + 0.01 * (hash01(i, 0) - 0.5)).collect();

    let mut cycle = 0;
    while locked.len() < k && cycle < MAX_CYCLES {
        cycle += 1;

        // orthogonalize the start vector against locked pairs
        for _ in 0..2 {
            for (_, u) in &locked {
                let c = dot(&r, u);
                for (x, &ux) in r.iter_mut().zip(u) {
                    *x -= c * ux;
                }
            }
        }
        let rnorm = dot(&r, &r).sqrt();
        if rnorm < 1e-12 {
            // degenerate restart direction; draw a fresh hashed one
            r = (0..n).map(|i| hash01(i, cycle as u32) - 0.5).collect();
            continue;
        }
        for x in r.iter_mut() {
            *x /= rnorm;
        }

        // one Lanczos cycle: build the tridiagonalization from r, fully
        // reorthogonalized against both the basis and the locked vectors
        let steps = m.min(n - locked.len());
        let mut basis: Vec<Vec<f64>> = vec![std::mem::take(&mut r)];
        let mut alphas: Vec<f64> = Vec::with_capacity(steps);
        let mut betas: Vec<f64> = Vec::with_capacity(steps);
        loop {
            let j = alphas.len();
            let vj = &basis[j];
            // w = B·v_j = 2 v_j − L v_j
            lap.matvec(vj, &mut tmp);
            let mut w: Vec<f64> = vj.iter().zip(&tmp).map(|(&x, &lx)| 2.0 * x - lx).collect();

            alphas.push(dot(&w, vj));
            for _ in 0..2 {
                for u in basis.iter().chain(locked.iter().map(|(_, u)| u)) {
                    let c = dot(&w, u);
                    for (x, &ux) in w.iter_mut().zip(u) {
                        *x -= c * ux;
                    }
                }
            }
            if alphas.len() == steps {
                break;
            }
            let beta = dot(&w, &w).sqrt();
            if beta < 1e-12 {
                break; // invariant subspace; Ritz pairs below are exact
            }
            for x in w.iter_mut() {
                *x /= beta;
            }
            betas.push(beta);
            basis.push(w);
        }

        // Ritz pairs of the tridiagonal
        let t_dim = alphas.len();
        let mut t = nalgebra::DMatrix::zeros(t_dim, t_dim);
        for (i, &a) in alphas.iter().enumerate() {
            t[(i, i)] = a;
        }
        for (i, &b) in betas.iter().enumerate() {
            t[(i, i + 1)] = b;
            t[(i + 1, i)] = b;
        }
        let eig = t.symmetric_eigen();
        let mut order: Vec<usize> = (0..t_dim).collect();
        order.sort_unstable_by(|&a, &b| eig.eigenvalues[b].total_cmp(&eig.eigenvalues[a]));

        // lock converged pairs (largest θ first); warm-restart from the best
        // unconverged Ritz vector
        let mut next_r: Option<Vec<f64>> = None;
        for &col in order.iter().take(k - locked.len() + 1) {
            let theta = eig.eigenvalues[col];
            let mut x = vec![0.0_f64; n];
            for (s, u) in basis.iter().enumerate() {
                let c = eig.eigenvectors[(s, col)];
                for (o, &ux) in x.iter_mut().zip(u) {
                    *o += c * ux;
                }
            }
            normalize(&mut x);
            // explicit residual ‖B·x − θ·x‖
            lap.matvec(&x, &mut tmp);
            let resid: f64 = x
                .iter()
                .zip(&tmp)
                .map(|(&xi, &lxi)| (2.0 * xi - lxi - theta * xi).powi(2))
                .sum::<f64>()
                .sqrt();
            if resid < LOCK_TOL && locked.len() < k {
                locked.push((2.0 - theta, x));
            } else if next_r.is_none() {
                next_r = Some(x);
            }
        }
        r = next_r.unwrap_or_else(|| (0..n).map(|i| hash01(i, cycle as u32) - 0.5).collect());
    }

    // ascending λ; canonical orientation
    locked.sort_by(|a, b| a.0.total_cmp(&b.0));
    let k = k.min(locked.len());
    let mut values = Vec::with_capacity(k);
    let mut vectors = vec![0.0_f64; n * k];
    for (j, (val, vec_j)) in locked.into_iter().take(k).enumerate() {
        values.push(val);
        let out = &mut vectors[j * n..(j + 1) * n];
        out.copy_from_slice(&vec_j);
        canonical_sign(out);
    }
    EigenPairs { values, vectors }
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn normalize(v: &mut [f64]) {
    let norm = dot(v, v).sqrt();
    for x in v.iter_mut() {
        *x /= norm;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fuzzy::FuzzyGraph;

    /// Path graph 0—1—2: normalized-Laplacian spectrum {0, 1, 2} with known
    /// eigenvectors (see sparse.rs tests).
    fn p3() -> Laplacian {
        Laplacian::new(&FuzzyGraph {
            n: 3,
            rows: vec![0, 1, 1, 2],
            cols: vec![1, 0, 2, 1],
            vals: vec![1.0, 1.0, 1.0, 1.0],
        })
    }

    /// Deterministic weighted graph with simple (non-degenerate) spectrum:
    /// a path with hashed weights plus two chords.
    fn wiggly(n: usize) -> Laplacian {
        let mut coo: Vec<(u32, u32, f32)> = Vec::new();
        let mut push = |a: u32, b: u32, w: f32| {
            coo.push((a, b, w));
            coo.push((b, a, w));
        };
        for i in 0..(n as u32 - 1) {
            let w = 0.5 + 0.4 * (((i.wrapping_mul(2654435761)) >> 16) as f32 / 65536.0);
            push(i, i + 1, w);
        }
        push(0, n as u32 / 2, 0.3);
        push(n as u32 / 4, 3 * n as u32 / 4, 0.2);
        coo.sort_unstable_by_key(|e| (e.0, e.1));
        Laplacian::new(&FuzzyGraph {
            n,
            rows: coo.iter().map(|e| e.0).collect(),
            cols: coo.iter().map(|e| e.1).collect(),
            vals: coo.iter().map(|e| e.2).collect(),
        })
    }

    fn assert_eigen_close(lap: &Laplacian, pairs: &EigenPairs, k: usize, tol: f64) {
        let n = lap.n();
        assert_eq!(pairs.values.len(), k);
        assert_eq!(pairs.vectors.len(), n * k);
        // ascending order
        for w in pairs.values.windows(2) {
            assert!(w[0] <= w[1] + 1e-12);
        }
        // residual check: ||L v − λ v|| small; unit-norm vectors
        let mut y = vec![0.0; n];
        for j in 0..k {
            let v = &pairs.vectors[j * n..(j + 1) * n];
            let norm: f64 = v.iter().map(|x| x * x).sum::<f64>().sqrt();
            assert!((norm - 1.0).abs() < 1e-8, "column {j} norm {norm}");
            lap.matvec(v, &mut y);
            let resid: f64 = y
                .iter()
                .zip(v)
                .map(|(yi, vi)| (yi - pairs.values[j] * vi).powi(2))
                .sum::<f64>()
                .sqrt();
            assert!(resid < tol, "column {j} residual {resid}");
        }
    }

    #[test]
    fn dense_recovers_p3_spectrum() {
        let lap = p3();
        let pairs = dense_eigenpairs(&lap, 3);
        let expected = [0.0, 1.0, 2.0];
        for (a, e) in pairs.values.iter().zip(&expected) {
            assert!((a - e).abs() < 1e-12, "{a} vs {e}");
        }
        assert_eigen_close(&lap, &pairs, 3, 1e-10);
        // λ=1 eigenvector is ±[1, 0, −1]/√2
        let v1 = &pairs.vectors[3..6];
        let inv_sqrt2 = std::f64::consts::FRAC_1_SQRT_2;
        assert!(v1[1].abs() < 1e-10);
        assert!((v1[0].abs() - inv_sqrt2).abs() < 1e-10);
        assert!((v1[0] + v1[2]).abs() < 1e-10); // opposite signs
    }

    #[test]
    fn lanczos_matches_dense_on_wiggly_graph() {
        let lap = wiggly(120);
        let k = 4;
        let dense = dense_eigenpairs(&lap, k);
        let lanc = lanczos_eigenpairs(&lap, k);
        for (a, e) in lanc.values.iter().zip(&dense.values) {
            assert!((a - e).abs() < 1e-8, "eigenvalue {a} vs {e}");
        }
        assert_eigen_close(&lap, &lanc, k, 1e-7);
        // per-column alignment up to sign
        let n = lap.n();
        for j in 0..k {
            let a = &lanc.vectors[j * n..(j + 1) * n];
            let e = &dense.vectors[j * n..(j + 1) * n];
            let dot: f64 = a.iter().zip(e).map(|(x, y)| x * y).sum();
            assert!(dot.abs() > 1.0 - 1e-7, "column {j} |cos| {}", dot.abs());
        }
    }

    #[test]
    fn lanczos_is_bit_identical_across_runs() {
        let lap = wiggly(150);
        let a = lanczos_eigenpairs(&lap, 3);
        let b = lanczos_eigenpairs(&lap, 3);
        assert_eq!(a.values, b.values);
        assert_eq!(a.vectors, b.vectors);
    }
}
