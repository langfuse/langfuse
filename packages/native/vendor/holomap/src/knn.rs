//! Exact brute-force k-nearest-neighbours — deterministic by construction.
//!
//! Semantics mirror the reference pipeline's exact path: each point's
//! neighbour list is sorted by `(distance, index)` — ties broken by the
//! lower index — and includes the point itself (distance 0). With exact
//! duplicates a point's own index may legitimately appear *after* a
//! lower-indexed duplicate; Stage 2 zeroes self-edges, so this matches
//! umap-learn's behaviour on the same lists.

use std::cmp::Ordering;

use crate::metric::{Metric, cosine, euclidean};

/// kNN graph in row-major `n × k` layout.
pub struct Knn {
    pub k: usize,
    /// `indices[i*k + j]` = index of point `i`'s `j`-th nearest neighbour.
    pub indices: Vec<u32>,
    /// `dists[i*k + j]` = distance to that neighbour.
    pub dists: Vec<f32>,
}

/// Exact kNN over `n_features`-dimensional points stored row-major in `data`.
pub fn exact_knn(data: &[f32], n_features: usize, k: usize, metric: Metric) -> Knn {
    let n = data.len() / n_features;
    let dist = match metric {
        Metric::Euclidean => euclidean,
        Metric::Cosine => cosine,
    };
    // (distance, index) total order — total_cmp keeps the order total and
    // deterministic; ties broken by lower index.
    let order =
        |x: &(f32, u32), y: &(f32, u32)| -> Ordering { x.0.total_cmp(&y.0).then(x.1.cmp(&y.1)) };
    // Each row keeps its k best candidates ascending by `order`. Distances
    // are computed once per unordered pair and shared by both rows: both
    // metrics are orientation-invariant bit-for-bit — euclidean squares
    // (y−x) = −(x−y) with identical index-order accumulation, and cosine's
    // products commute exactly (na/nb swap under a commuting multiply). So
    // each row sees the same candidate multiset as the per-endpoint form,
    // indices are unique per row, and the sel smallest under the total order
    // form a unique set independent of arrival order.
    let sel = k.min(n);
    // bounded insertion: binary-search the ascending row; past-position-sel
    // candidates can never make the sel smallest and are dropped
    let insert = |row: &mut Vec<(f32, u32)>, cand: (f32, u32)| {
        let pos = row
            .binary_search_by(|e| order(e, &cand))
            .unwrap_or_else(|p| p);
        if pos >= sel {
            return;
        }
        row.insert(pos, cand);
        if row.len() > sel {
            row.pop();
        }
    };
    let mut rows: Vec<Vec<(f32, u32)>> = Vec::with_capacity(n);
    for i in 0..n {
        // seed the self slot at exactly 0.0 rather than running the metric on
        // a point against itself: cosine of a point with itself leaves a ±ULP
        // residue that poisons Stage 2's first-non-zero rho rule. Self is not
        // guaranteed to survive — lower-indexed exact duplicates tie at zero
        // and the (distance,index) tie-break evicts it, matching the
        // reference's full sort; the 0.0 seed only fixes the value when present
        let row: Vec<(f32, u32)> = if sel > 0 {
            vec![(0.0, i as u32)]
        } else {
            vec![]
        };
        rows.push(row);
    }
    for i in 0..n {
        let a = &data[i * n_features..(i + 1) * n_features];
        for j in i + 1..n {
            let b = &data[j * n_features..(j + 1) * n_features];
            let d = dist(a, b);
            insert(&mut rows[i], (d, j as u32));
            insert(&mut rows[j], (d, i as u32));
        }
    }
    let mut indices = Vec::with_capacity(n * sel);
    let mut dists = Vec::with_capacity(n * sel);
    for row in rows {
        for (d, j) in row {
            indices.push(j);
            dists.push(d);
        }
    }
    Knn { k, indices, dists }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Four points on a line: 0.0, 1.0, 3.0, 7.0 (1-d).
    const LINE: [f32; 4] = [0.0, 1.0, 3.0, 7.0];

    #[test]
    fn knn_sorted_by_distance_self_first() {
        let knn = exact_knn(&LINE, 1, 3, Metric::Euclidean);
        // point 1 (at 1.0): self, then 0 (d=1), then 2 (d=2)
        assert_eq!(&knn.indices[3..6], &[1, 0, 2]);
        assert_eq!(&knn.dists[3..6], &[0.0, 1.0, 2.0]);
        // point 3 (at 7.0): self, then 2 (d=4), then 1 (d=6)
        assert_eq!(&knn.indices[9..12], &[3, 2, 1]);
        assert_eq!(&knn.dists[9..12], &[0.0, 4.0, 6.0]);
    }

    #[test]
    fn knn_ties_broken_by_lower_index() {
        // point 2 duplicates point 0 → for BOTH, the d=0 tie lists 0 before 2
        let data: [f32; 3] = [5.0, 9.0, 5.0];
        let knn = exact_knn(&data, 1, 2, Metric::Euclidean);
        assert_eq!(&knn.indices[0..2], &[0, 2]); // point 0: self wins tie
        assert_eq!(&knn.indices[4..6], &[0, 2]); // point 2: 0 precedes self
        assert_eq!(&knn.dists[4..6], &[0.0, 0.0]);
    }

    #[test]
    fn knn_cosine_self_distance_exactly_zero() {
        // cosine(a, a) through the metric leaves a ±ULP residue; the kNN
        // layer must report the self slot as exactly 0.0 so rho's
        // first-non-zero rule never grabs the epsilon
        let data: [f32; 4] = [0.3, 0.7, 0.31, 0.69]; // nearly parallel pair
        let knn = exact_knn(&data, 2, 2, Metric::Cosine);
        assert_eq!(knn.dists[0], 0.0);
        assert_eq!(knn.dists[2], 0.0);
        assert!(knn.dists[1] > 0.0 && knn.dists[3] > 0.0);
    }

    #[test]
    fn knn_cosine_orders_by_angle_not_magnitude() {
        // 2-d: point 0 = (1,0); point 1 = (100, 1) tiny angle, huge magnitude;
        // point 2 = (0.1, 0.1) at 45°. Cosine kNN for 0 must rank 1 over 2.
        let data: [f32; 6] = [1.0, 0.0, 100.0, 1.0, 0.1, 0.1];
        let knn = exact_knn(&data, 2, 3, Metric::Cosine);
        assert_eq!(&knn.indices[0..3], &[0, 1, 2]);
        assert!(knn.dists[1] < knn.dists[2]);
    }
}
