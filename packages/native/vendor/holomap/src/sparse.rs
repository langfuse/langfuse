//! Sparse machinery for the spectral stage: CSR storage and the
//! symmetric-normalized graph Laplacian `L = I − D^{−1/2} W D^{−1/2}`.
//!
//! Eigensolves run in `f64` (the reference pipeline's scipy does too); the
//! float32 fuzzy-graph weights are widened once at construction. Row order
//! comes from the FuzzyGraph's sorted COO — iteration order is deterministic
//! everywhere, never hash-based.

use crate::fuzzy::FuzzyGraph;

/// CSR matrix over `f64`, rows/cols `0..n`.
pub struct Csr {
    pub n: usize,
    pub indptr: Vec<usize>, // length n + 1
    pub indices: Vec<u32>,
    pub vals: Vec<f64>,
}

impl Csr {
    /// Build from the (row, col)-sorted COO of a fuzzy graph.
    pub fn from_fuzzy(g: &FuzzyGraph) -> Csr {
        let mut indptr = vec![0_usize; g.n + 1];
        for &r in &g.rows {
            indptr[r as usize + 1] += 1;
        }
        for i in 0..g.n {
            indptr[i + 1] += indptr[i];
        }
        Csr {
            n: g.n,
            indptr,
            indices: g.cols.clone(),
            vals: g.vals.iter().map(|&v| f64::from(v)).collect(),
        }
    }

    /// Row slice as (indices, vals).
    pub fn row(&self, i: usize) -> (&[u32], &[f64]) {
        let (lo, hi) = (self.indptr[i], self.indptr[i + 1]);
        (&self.indices[lo..hi], &self.vals[lo..hi])
    }
}

/// Symmetric-normalized Laplacian, stored as the normalized adjacency
/// `S = D^{−1/2} W D^{−1/2}` so `L·x = x − S·x`.
pub struct Laplacian {
    s: Csr,
    /// Degree vector `d_i = Σ_j w_ij` (graph is symmetric). Read by tests
    /// (the trivial eigenvector is `D^{1/2}·1`); production code only needs
    /// it during construction.
    #[allow(dead_code)]
    pub degrees: Vec<f64>,
}

impl Laplacian {
    pub fn new(g: &FuzzyGraph) -> Laplacian {
        let mut s = Csr::from_fuzzy(g);
        let mut degrees = vec![0.0_f64; g.n];
        for (i, deg) in degrees.iter_mut().enumerate() {
            let (lo, hi) = (s.indptr[i], s.indptr[i + 1]);
            *deg = s.vals[lo..hi].iter().sum();
        }
        let inv_sqrt: Vec<f64> = degrees.iter().map(|&d| 1.0 / d.sqrt()).collect();
        for i in 0..g.n {
            let (lo, hi) = (s.indptr[i], s.indptr[i + 1]);
            for p in lo..hi {
                s.vals[p] *= inv_sqrt[i] * inv_sqrt[s.indices[p] as usize];
            }
        }
        Laplacian { s, degrees }
    }

    pub fn n(&self) -> usize {
        self.s.n
    }

    /// `y = L·x = x − S·x`.
    pub fn matvec(&self, x: &[f64], y: &mut [f64]) {
        for i in 0..self.s.n {
            let (idx, vals) = self.s.row(i);
            let sx: f64 = idx.iter().zip(vals).map(|(&j, &v)| v * x[j as usize]).sum();
            y[i] = x[i] - sx;
        }
    }

    /// Dense column-major materialization (the N ≤ 2k fallback path).
    pub fn to_dense(&self) -> Vec<f64> {
        let n = self.s.n;
        let mut dense = vec![0.0_f64; n * n];
        for i in 0..n {
            dense[i * n + i] = 1.0; // column-major: (i, i)
            let (idx, vals) = self.s.row(i);
            for (&j, &v) in idx.iter().zip(vals) {
                dense[j as usize * n + i] -= v; // column j, row i
            }
        }
        dense
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Path graph 0—1—2, unit weights: degrees [1, 2, 1]; the normalized
    /// Laplacian has eigenpairs λ=0 ↦ [1, √2, 1], λ=1 ↦ [1, 0, −1],
    /// λ=2 ↦ [1, −√2, 1].
    fn p3() -> FuzzyGraph {
        FuzzyGraph {
            n: 3,
            rows: vec![0, 1, 1, 2],
            cols: vec![1, 0, 2, 1],
            vals: vec![1.0, 1.0, 1.0, 1.0],
        }
    }

    #[test]
    fn csr_from_sorted_coo() {
        let csr = Csr::from_fuzzy(&p3());
        assert_eq!(csr.indptr, vec![0, 1, 3, 4]);
        let (idx, vals) = csr.row(1);
        assert_eq!(idx, &[0, 2]);
        assert_eq!(vals, &[1.0, 1.0]);
    }

    #[test]
    fn laplacian_degrees_and_known_eigenpairs() {
        let lap = Laplacian::new(&p3());
        assert_eq!(lap.degrees, vec![1.0, 2.0, 1.0]);
        assert_eq!(lap.n(), 3);

        // trivial eigenvector D^{1/2}·1 maps to ~0
        let v0 = [1.0, std::f64::consts::SQRT_2, 1.0];
        let mut y = [0.0; 3];
        lap.matvec(&v0, &mut y);
        for v in y {
            assert!(v.abs() < 1e-12, "trivial eigvec residual {v}");
        }

        // λ = 1 eigenvector [1, 0, −1] maps to itself
        let v1 = [1.0, 0.0, -1.0];
        lap.matvec(&v1, &mut y);
        for (a, e) in y.iter().zip(&v1) {
            assert!((a - e).abs() < 1e-12);
        }
    }

    #[test]
    fn dense_matches_matvec_on_basis_vectors() {
        let lap = Laplacian::new(&p3());
        let dense = lap.to_dense();
        let n = 3;
        for j in 0..n {
            let mut e = vec![0.0; n];
            e[j] = 1.0;
            let mut y = vec![0.0; n];
            lap.matvec(&e, &mut y);
            for i in 0..n {
                assert!((dense[j * n + i] - y[i]).abs() < 1e-15);
            }
        }
    }
}
