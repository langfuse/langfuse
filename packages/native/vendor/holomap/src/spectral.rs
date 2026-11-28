//! Initial embedding — Stage 3. Mirrors umap-learn 0.5.12 semantics:
//!
//! - `Init::Spectral` (default): eigenvectors 2..(dim+1) of the normalized
//!   Laplacian (the trivial first is dropped), then scaled so the largest
//!   |coordinate| is 10 and perturbed with seeded N(0, 1e-4) noise
//!   (`noisy_scale_coords`). Multi-component graphs lay out each component
//!   around deterministic meta-positions: ±identity rows when
//!   `n_components ≤ 2·dim` (umap's exact rule), else a spectral embedding
//!   of the component-centroid affinity matrix `exp(−d²)`.
//! - `Init::Random`: seeded uniform in [−10, 10).
//!
//! RNG draw order is fixed and documented: tiny-component uniforms in
//! component-label order first, then the global noise pass in row-major
//! order. Same seed → same draws → bit-identical init.

use crate::components::connected_components;
use crate::eigen::smallest_eigenpairs;
use crate::fmath::HostInvariant;
use crate::fuzzy::FuzzyGraph;
use crate::metric::euclidean;
use crate::rng::SeededRng;
use crate::sparse::{Csr, Laplacian};

/// Initialization strategy for the embedding.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Init {
    /// Laplacian-eigenmap initialization (the default) — deterministic
    /// spectral structure plus seeded 1e-4 noise.
    Spectral,
    /// Seeded uniform in [−10, 10). The fallback when spectral structure
    /// isn't wanted.
    Random,
}

/// Initial embedding, row-major `n × dim` f32. `data` (row-major
/// `n × n_features`) feeds component centroids when the graph splits into
/// more than `2·dim` components.
pub fn initial_embedding(
    data: &[f32],
    n_features: usize,
    graph: &FuzzyGraph,
    dim: usize,
    init: Init,
    rng: &mut SeededRng,
) -> Vec<f32> {
    let n = graph.n;
    if init == Init::Random {
        return (0..n * dim).map(|_| rng.uniform(-10.0, 10.0)).collect();
    }

    let comps = connected_components(&Csr::from_fuzzy(graph));
    let coords = if comps.n_components == 1 {
        spectral_layout_single(graph, dim)
    } else {
        multi_component_layout(
            data,
            n_features,
            graph,
            dim,
            &comps.labels,
            comps.n_components,
            rng,
        )
    };
    noisy_scale_coords(&coords, rng)
}

/// Eigenvectors 2..(dim+1) of the single-component graph's normalized
/// Laplacian, row-major `n × dim` in f64.
fn spectral_layout_single(graph: &FuzzyGraph, dim: usize) -> Vec<f64> {
    let lap = Laplacian::new(graph);
    let pairs = smallest_eigenpairs(&lap, dim + 1);
    let n = graph.n;
    let mut coords = vec![0.0_f64; n * dim];
    for d in 0..dim {
        let col = &pairs.vectors[(d + 1) * n..(d + 2) * n]; // skip trivial
        for i in 0..n {
            coords[i * dim + d] = col[i];
        }
    }
    coords
}

/// umap-learn's multi-component layout: deterministic ±identity meta
/// positions for `n_components ≤ 2·dim`, else a spectral embedding of the
/// component-centroid affinity matrix. Components smaller than `2·dim` (or
/// `≤ dim+1`) get seeded uniform placement around their meta position.
fn multi_component_layout(
    data: &[f32],
    n_features: usize,
    graph: &FuzzyGraph,
    dim: usize,
    labels: &[u32],
    n_components: usize,
    rng: &mut SeededRng,
) -> Vec<f64> {
    let n = graph.n;
    let meta = if n_components > 2 * dim {
        component_meta_layout(data, n_features, labels, n_components, dim)
    } else {
        // base = [eye(k) | 0], meta = [base; −base][..n_components]
        let k = n_components.div_ceil(2);
        let mut meta = vec![0.0_f64; n_components * dim];
        for c in 0..n_components {
            let (row, sign) = if c < k { (c, 1.0) } else { (c - k, -1.0) };
            meta[c * dim + row] = sign;
        }
        meta
    };

    let mut result = vec![0.0_f64; n * dim];
    for label in 0..n_components {
        // data_range: half the distance to the nearest other meta position
        let mine = &meta[label * dim..(label + 1) * dim];
        let mut nearest = f64::INFINITY;
        for other in 0..n_components {
            if other == label {
                continue;
            }
            let o = &meta[other * dim..(other + 1) * dim];
            let d: f64 = mine
                .iter()
                .zip(o)
                .map(|(a, b)| (a - b).powi(2))
                .sum::<f64>()
                .sqrt();
            if d > 0.0 && d < nearest {
                nearest = d;
            }
        }
        let data_range = nearest / 2.0;

        let members: Vec<usize> = (0..n).filter(|&i| labels[i] as usize == label).collect();
        if members.len() < 2 * dim || members.len() <= dim + 1 {
            // tiny component: seeded uniform box around the meta position
            for &i in &members {
                for d in 0..dim {
                    result[i * dim + d] =
                        f64::from(rng.uniform(-(data_range as f32), data_range as f32)) + mine[d];
                }
            }
        } else {
            let sub = extract_component(graph, labels, label as u32, &members);
            let local = spectral_layout_single(&sub, dim);
            let max_abs = local.iter().fold(0.0_f64, |m, &x| m.max(x.abs()));
            let expansion = if max_abs > 0.0 {
                data_range / max_abs
            } else {
                0.0
            };
            for (li, &i) in members.iter().enumerate() {
                for d in 0..dim {
                    result[i * dim + d] = local[li * dim + d] * expansion + mine[d];
                }
            }
        }
    }
    result
}

/// Meta positions for many components: data-space centroids → pairwise
/// euclidean distances → affinity exp(−d²) → spectral embedding (trivial
/// eigenvector dropped) → divide by the max entry, per umap-learn.
fn component_meta_layout(
    data: &[f32],
    n_features: usize,
    labels: &[u32],
    n_components: usize,
    dim: usize,
) -> Vec<f64> {
    let n = labels.len();
    let mut centroids = vec![0.0_f32; n_components * n_features];
    let mut counts = vec![0_usize; n_components];
    for i in 0..n {
        let c = labels[i] as usize;
        counts[c] += 1;
        for f in 0..n_features {
            centroids[c * n_features + f] += data[i * n_features + f];
        }
    }
    for c in 0..n_components {
        for f in 0..n_features {
            centroids[c * n_features + f] /= counts[c] as f32;
        }
    }

    // dense affinity graph over centroids (self-edges excluded; degrees stay
    // positive because exp is never 0)
    let mut rows = Vec::new();
    let mut cols = Vec::new();
    let mut vals = Vec::new();
    for i in 0..n_components {
        for j in 0..n_components {
            if i == j {
                continue;
            }
            let d = f64::from(euclidean(
                &centroids[i * n_features..(i + 1) * n_features],
                &centroids[j * n_features..(j + 1) * n_features],
            ));
            rows.push(i as u32);
            cols.push(j as u32);
            vals.push((-(d * d)).hi_exp() as f32);
        }
    }
    let affinity = FuzzyGraph {
        n: n_components,
        rows,
        cols,
        vals,
    };
    let emb = spectral_layout_single(&affinity, dim);
    let max = emb.iter().fold(f64::MIN, |m, &x| m.max(x));
    emb.iter().map(|&x| x / max).collect()
}

/// Component subgraph with vertices reindexed to 0..members.len() in
/// ascending global order (monotone reindex preserves COO sort order).
fn extract_component(
    graph: &FuzzyGraph,
    labels: &[u32],
    label: u32,
    members: &[usize],
) -> FuzzyGraph {
    let mut local_of = vec![u32::MAX; graph.n];
    for (li, &g) in members.iter().enumerate() {
        local_of[g] = li as u32;
    }
    let mut rows = Vec::new();
    let mut cols = Vec::new();
    let mut vals = Vec::new();
    for e in 0..graph.rows.len() {
        let (r, c) = (graph.rows[e] as usize, graph.cols[e] as usize);
        if labels[r] == label && labels[c] == label {
            rows.push(local_of[r]);
            cols.push(local_of[c]);
            vals.push(graph.vals[e]);
        }
    }
    FuzzyGraph {
        n: members.len(),
        rows,
        cols,
        vals,
    }
}

/// umap-learn's `noisy_scale_coords`: scale so max |coord| = 10, cast to
/// f32, add seeded N(0, 1e-4) noise. Noise drawn row-major — fixed order.
fn noisy_scale_coords(coords: &[f64], rng: &mut SeededRng) -> Vec<f32> {
    let max_abs = coords.iter().fold(0.0_f64, |m, &x| m.max(x.abs()));
    let expansion = 10.0 / max_abs;
    coords
        .iter()
        .map(|&x| (x * expansion) as f32 + rng.normal(1e-4))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Path graph 0—1—2 as a fuzzy graph.
    fn p3() -> FuzzyGraph {
        FuzzyGraph {
            n: 3,
            rows: vec![0, 1, 1, 2],
            cols: vec![1, 0, 2, 1],
            vals: vec![1.0, 1.0, 1.0, 1.0],
        }
    }

    /// Two disjoint path graphs of 5 vertices each (0–4, 5–9).
    fn two_p5() -> FuzzyGraph {
        let mut coo: Vec<(u32, u32)> = Vec::new();
        for base in [0u32, 5] {
            for i in 0..4 {
                coo.push((base + i, base + i + 1));
                coo.push((base + i + 1, base + i));
            }
        }
        coo.sort_unstable();
        FuzzyGraph {
            n: 10,
            rows: coo.iter().map(|&(r, _)| r).collect(),
            cols: coo.iter().map(|&(_, c)| c).collect(),
            vals: vec![1.0; coo.len()],
        }
    }

    #[test]
    fn random_init_seeded_and_bounded() {
        let g = p3();
        let mut r1 = SeededRng::new(9);
        let mut r2 = SeededRng::new(9);
        let a = initial_embedding(&[], 0, &g, 2, Init::Random, &mut r1);
        let b = initial_embedding(&[], 0, &g, 2, Init::Random, &mut r2);
        assert_eq!(a, b);
        assert_eq!(a.len(), 6);
        assert!(a.iter().all(|&x| (-10.0..10.0).contains(&x)));
    }

    #[test]
    fn spectral_init_p3_scales_second_eigenvector_to_ten() {
        // dim=1: the λ=1 eigenvector ±[1, 0, −1]/√2, canonically signed
        // (index 0 positive), scaled so max |coord| = 10, plus 1e-4 noise.
        let g = p3();
        let mut rng = SeededRng::new(42);
        let emb = initial_embedding(&[], 0, &g, 1, Init::Spectral, &mut rng);
        assert_eq!(emb.len(), 3);
        assert!((emb[0] - 10.0).abs() < 0.01, "got {}", emb[0]);
        assert!(emb[1].abs() < 0.01);
        assert!((emb[2] + 10.0).abs() < 0.01);
    }

    #[test]
    fn spectral_init_is_bit_identical_across_runs() {
        let g = two_p5();
        let a = initial_embedding(&[], 0, &g, 2, Init::Spectral, &mut SeededRng::new(7));
        let b = initial_embedding(&[], 0, &g, 2, Init::Spectral, &mut SeededRng::new(7));
        assert_eq!(a, b); // f32 bit-equality
    }

    #[test]
    fn multi_component_separates_components() {
        // 2 components ≤ 2·dim=4 → meta positions ±[1, 0]; after the global
        // ±10 rescale, component 0 sits strictly at positive x, component 1
        // strictly negative, and they never interleave.
        let g = two_p5();
        let mut rng = SeededRng::new(11);
        let emb = initial_embedding(&[], 0, &g, 2, Init::Spectral, &mut rng);
        assert_eq!(emb.len(), 20);
        let xs: Vec<f32> = (0..10).map(|i| emb[i * 2]).collect();
        assert!(xs[..5].iter().all(|&x| x > 0.0), "c0 x: {:?}", &xs[..5]);
        assert!(xs[5..].iter().all(|&x| x < 0.0), "c1 x: {:?}", &xs[5..]);
        // each component has internal spectral structure (not collapsed)
        let spread0 = xs[..5].iter().cloned().fold(f32::MIN, f32::max)
            - xs[..5].iter().cloned().fold(f32::MAX, f32::min);
        assert!(spread0 > 0.1, "component 0 collapsed: spread {spread0}");
    }

    #[test]
    fn many_components_use_centroid_meta_layout() {
        // 5 isolated vertex-pairs with dim=2: 5 > 2·dim → centroid-affinity
        // branch. Data places pair centroids on a line so the meta layout
        // must keep them distinct.
        let mut coo: Vec<(u32, u32)> = Vec::new();
        for p in 0..5u32 {
            coo.push((2 * p, 2 * p + 1));
            coo.push((2 * p + 1, 2 * p));
        }
        coo.sort_unstable();
        let g = FuzzyGraph {
            n: 10,
            rows: coo.iter().map(|&(r, _)| r).collect(),
            cols: coo.iter().map(|&(_, c)| c).collect(),
            vals: vec![1.0; coo.len()],
        };
        // 1-d data: pair p sits at x ≈ 3p
        let data: Vec<f32> = (0..10)
            .map(|i| 3.0 * (i / 2) as f32 + 0.1 * (i % 2) as f32)
            .collect();
        let mut rng = SeededRng::new(3);
        let emb = initial_embedding(&data, 1, &g, 2, Init::Spectral, &mut rng);
        assert_eq!(emb.len(), 20);
        assert!(emb.iter().all(|x| x.is_finite()));
        // component centers must be pairwise distinct
        let centers: Vec<(f32, f32)> = (0..5)
            .map(|p| {
                let (a, b) = (4 * p, 4 * p + 2);
                ((emb[a] + emb[b]) / 2.0, (emb[a + 1] + emb[b + 1]) / 2.0)
            })
            .collect();
        for i in 0..5 {
            for j in (i + 1)..5 {
                let d = (centers[i].0 - centers[j].0).hypot(centers[i].1 - centers[j].1);
                assert!(d > 0.5, "components {i},{j} overlap: {d}");
            }
        }
    }
}
