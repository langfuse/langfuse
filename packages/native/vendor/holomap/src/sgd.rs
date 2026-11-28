//! Stage 4 — seeded stochastic gradient descent on the fuzzy graph.
//!
//! Serial port of umap-learn 0.5.12 `optimize_layout_euclidean` (the
//! `parallel=False` path) with one documented divergence: negative-sample
//! indices come from the crate's single PCG64 stream in edge-iteration
//! order, not umap's per-vertex `tau_rand_int` state (byte parity with
//! umap-learn is a non-goal; determinism is the contract).
//!
//! Reference semantics mirrored exactly:
//! - edges with weight < max/n_epochs are dropped before scheduling
//! - `epochs_per_sample = max(w)/w`; negatives at `eps/negative_sample_rate`
//! - attractive `−2ab·d^{2b−2} / (1 + a·d^{2b})`, per-dim clip to ±4,
//!   `move_other = true`
//! - repulsive `2γb / ((0.001 + d²)(1 + a·d^{2b}))`, self-pairs skipped,
//!   only the head moves
//! - `alpha = 1 − n/n_epochs` per epoch, linear to 0

use crate::fmath::HostInvariant;
use crate::fuzzy::FuzzyGraph;
use crate::rng::SeededRng;

/// umap-learn's `n_epochs` default: 500 up to 10k points, 200 above.
pub fn default_n_epochs(n: usize) -> usize {
    if n <= 10_000 { 500 } else { 200 }
}

/// Edge list ready for SGD: weights below `max/n_epochs` dropped (the
/// reference's pruning rule for `n_epochs > 10`), `epochs_per_sample`
/// = `max(w)/w` per surviving edge, in the graph's sorted COO order.
pub struct EdgeSchedule {
    pub head: Vec<u32>,
    pub tail: Vec<u32>,
    pub epochs_per_sample: Vec<f64>,
}

pub fn schedule_edges(graph: &FuzzyGraph, n_epochs: usize) -> EdgeSchedule {
    let max_w = graph.vals.iter().copied().fold(0.0_f32, f32::max);
    // reference: prune by n_epochs when > 10, by the default schedule below
    let prune_epochs = if n_epochs > 10 {
        n_epochs
    } else {
        default_n_epochs(graph.n)
    };
    let cutoff = max_w / prune_epochs as f32;

    let mut head = Vec::new();
    let mut tail = Vec::new();
    let mut epochs_per_sample = Vec::new();
    for e in 0..graph.vals.len() {
        let w = graph.vals[e];
        if w < cutoff {
            continue;
        }
        head.push(graph.rows[e]);
        tail.push(graph.cols[e]);
        epochs_per_sample.push(f64::from(max_w) / f64::from(w));
    }
    EdgeSchedule {
        head,
        tail,
        epochs_per_sample,
    }
}

/// Run the seeded SGD over `n_epochs`, mutating `embedding` (row-major
/// `n_vertices × dim`) in place. `gamma`, `negative_sample_rate` and
/// `initial_alpha` are the reference defaults (1.0, 5.0, 1.0).
#[allow(clippy::too_many_arguments)] // mirrors the reference signature
pub fn optimize_embedding(
    embedding: &mut [f32],
    dim: usize,
    n_vertices: usize,
    schedule: &EdgeSchedule,
    n_epochs: usize,
    a: f64,
    b: f64,
    rng: &mut SeededRng,
) {
    const GAMMA: f64 = 1.0; // repulsion strength
    const NEGATIVE_SAMPLE_RATE: f64 = 5.0;
    const INITIAL_ALPHA: f64 = 1.0;

    let eps = &schedule.epochs_per_sample;
    let eps_neg: Vec<f64> = eps.iter().map(|&e| e / NEGATIVE_SAMPLE_RATE).collect();
    let mut epoch_of_next_sample = eps.clone();
    let mut epoch_of_next_negative = eps_neg.clone();

    for epoch in 0..n_epochs {
        let alpha = INITIAL_ALPHA * (1.0 - epoch as f64 / n_epochs as f64);
        let n = epoch as f64;

        for i in 0..eps.len() {
            if epoch_of_next_sample[i] > n {
                continue;
            }
            let j = schedule.head[i] as usize;
            let k = schedule.tail[i] as usize;

            // attractive update — both endpoints move (move_other = true)
            let d2 = rdist(embedding, dim, j, k);
            let grad_coeff = if d2 > 0.0 {
                let d2 = f64::from(d2);
                (-2.0 * a * b * d2.hi_powf(b - 1.0)) / (a * d2.hi_powf(b) + 1.0)
            } else {
                0.0
            };
            for d in 0..dim {
                let cur = embedding[j * dim + d];
                let oth = embedding[k * dim + d];
                let grad = clip(grad_coeff * f64::from(cur - oth)) * alpha;
                embedding[j * dim + d] = cur + grad as f32;
                embedding[k * dim + d] = oth - grad as f32;
            }
            epoch_of_next_sample[i] += eps[i];

            // negative sampling — reference truncation semantics, including
            // the possibly-negative count that nudges the schedule back
            let n_neg = ((n - epoch_of_next_negative[i]) / eps_neg[i]) as i64;
            for _ in 0..n_neg.max(0) {
                let neg = rng.next_index(n_vertices);
                let d2 = rdist(embedding, dim, j, neg);
                let grad_coeff = if d2 > 0.0 {
                    let d2 = f64::from(d2);
                    2.0 * GAMMA * b / ((0.001 + d2) * (a * d2.hi_powf(b) + 1.0))
                } else if j == neg {
                    continue;
                } else {
                    0.0
                };
                for d in 0..dim {
                    let cur = embedding[j * dim + d];
                    let grad = if grad_coeff > 0.0 {
                        let oth = embedding[neg * dim + d];
                        clip(grad_coeff * f64::from(cur - oth))
                    } else {
                        0.0
                    };
                    embedding[j * dim + d] = cur + (grad * alpha) as f32;
                }
            }
            epoch_of_next_negative[i] += n_neg as f64 * eps_neg[i];
        }
    }
}

/// Squared euclidean distance between embedding rows `j` and `k` — float32
/// accumulation like the reference's `rdist`.
#[inline]
fn rdist(embedding: &[f32], dim: usize, j: usize, k: usize) -> f32 {
    let mut sum = 0.0_f32;
    for d in 0..dim {
        let diff = embedding[j * dim + d] - embedding[k * dim + d];
        sum += diff * diff;
    }
    sum
}

/// The reference's ±4 gradient clamp.
#[inline]
fn clip(v: f64) -> f64 {
    v.clamp(-4.0, 4.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_epochs_by_size() {
        assert_eq!(default_n_epochs(100), 500);
        assert_eq!(default_n_epochs(10_000), 500);
        assert_eq!(default_n_epochs(10_001), 200);
    }

    #[test]
    fn schedule_prunes_and_scales() {
        // weights: 1.0 (max), 0.5, 0.001 — with n_epochs=500 the cutoff is
        // 1/500 = 0.002, so the last edge drops; eps = max/w
        let g = FuzzyGraph {
            n: 4,
            rows: vec![0, 1, 2],
            cols: vec![1, 2, 3],
            vals: vec![1.0, 0.5, 0.001],
        };
        let s = schedule_edges(&g, 500);
        assert_eq!(s.head, vec![0, 1]);
        assert_eq!(s.tail, vec![1, 2]);
        assert_eq!(s.epochs_per_sample, vec![1.0, 2.0]);
    }

    #[test]
    fn attraction_contracts_connected_pair() {
        // two points connected with weight 1, starting 8 units apart —
        // optimization must pull them together
        let g = FuzzyGraph {
            n: 2,
            rows: vec![0, 1],
            cols: vec![1, 0],
            vals: vec![1.0, 1.0],
        };
        let s = schedule_edges(&g, 100);
        let mut emb = vec![0.0_f32, 0.0, 8.0, 0.0];
        let mut rng = SeededRng::new(42);
        optimize_embedding(&mut emb, 2, 2, &s, 100, 1.577, 0.895, &mut rng);
        let d = ((emb[0] - emb[2]).powi(2) + (emb[1] - emb[3]).powi(2)).sqrt();
        assert!(d < 4.0, "pair did not contract: d = {d}");
        assert!(emb.iter().all(|x| x.is_finite()));
    }

    #[test]
    fn optimizer_is_bit_identical_same_seed() {
        let g = FuzzyGraph {
            n: 3,
            rows: vec![0, 1, 1, 2],
            cols: vec![1, 0, 2, 1],
            vals: vec![1.0, 1.0, 0.7, 0.7],
        };
        let s = schedule_edges(&g, 50);
        let init = vec![0.0_f32, 0.0, 5.0, 1.0, -3.0, 2.0];
        let run = |seed: u64| {
            let mut emb = init.clone();
            let mut rng = SeededRng::new(seed);
            optimize_embedding(&mut emb, 2, 3, &s, 50, 1.577, 0.895, &mut rng);
            emb
        };
        assert_eq!(run(7), run(7));
        assert_ne!(run(7), run(8), "negative sampling must be seed-driven");
    }

    #[test]
    fn schedule_keeps_all_at_low_epochs() {
        // n_epochs ≤ 10: reference prunes by max/default_epochs instead;
        // with default 500 the 0.01 edge (cutoff 0.002) survives
        let g = FuzzyGraph {
            n: 3,
            rows: vec![0, 1],
            cols: vec![1, 2],
            vals: vec![1.0, 0.01],
        };
        let s = schedule_edges(&g, 10);
        assert_eq!(s.head.len(), 2);
    }
}
