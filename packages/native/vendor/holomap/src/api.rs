//! The public surface: a builder whose ONLY entry point takes a seed.
//!
//! `Holomap::builder(seed)` — there is no unseeded constructor and none
//! will ever exist. Every knob mirrors umap-learn's defaults: 2 components,
//! 15 neighbours, `min_dist` 0.1, `spread` 1.0, euclidean, auto epochs
//! (500 up to 10k points, 200 above), spectral init.

use crate::curve::find_ab_params;
use crate::fuzzy::fuzzy_simplicial_set;
use crate::knn::exact_knn;
use crate::metric::Metric;
use crate::rng::SeededRng;
use crate::sgd::{default_n_epochs, optimize_embedding, schedule_edges};
use crate::smooth_knn::smooth_knn;
use crate::spectral::{Init, initial_embedding};

/// Everything [`Holomap::fit_transform`] can reject.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HolomapError {
    /// `data` is empty or its length is not a multiple of `n_features`.
    BadShape {
        /// `data.len()` as received.
        len: usize,
        /// The `n_features` argument it failed to divide by.
        n_features: usize,
    },
    /// Fewer points than `n_neighbors + 1` — the kNN stage needs headroom.
    TooFewPoints {
        /// Number of points in `data`.
        n: usize,
        /// The configured neighbourhood size.
        n_neighbors: usize,
    },
    /// A parameter failed validation (named in the message).
    InvalidParameter(&'static str),
    /// `data` contains a non-finite value (NaN or ±∞) at this flat index.
    /// Distances and the fuzzy graph have no meaning over non-finite input,
    /// so it is rejected up front rather than silently producing a NaN
    /// embedding.
    NonFiniteInput {
        /// Flat index into `data` of the first offending value.
        index: usize,
    },
}

impl std::fmt::Display for HolomapError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BadShape { len, n_features } => write!(
                f,
                "data length {len} is not a positive multiple of n_features {n_features}"
            ),
            Self::TooFewPoints { n, n_neighbors } => write!(
                f,
                "need more than n_neighbors={n_neighbors} points, got {n}"
            ),
            Self::InvalidParameter(what) => write!(f, "invalid parameter: {what}"),
            Self::NonFiniteInput { index } => {
                write!(f, "data contains a non-finite value at index {index}")
            }
        }
    }
}

impl std::error::Error for HolomapError {}

/// Configured reducer. Construct via [`Holomap::builder`].
///
/// With the `serde` feature, the full parameter set — including the seed —
/// serializes, so a persisted config replays to a bit-identical embedding.
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Holomap {
    seed: u64,
    n_components: usize,
    n_neighbors: usize,
    min_dist: f32,
    spread: f32,
    metric: Metric,
    n_epochs: Option<usize>,
    init: Init,
}

/// Builder — every field has a reference-default except the seed, which is
/// the required entry argument.
#[derive(Clone, Debug)]
pub struct HolomapBuilder {
    inner: Holomap,
}

impl Holomap {
    /// Start configuring a reducer. The seed is required here — it is the
    /// only way in, and there is no unseeded alternative.
    pub fn builder(seed: u64) -> HolomapBuilder {
        HolomapBuilder {
            inner: Holomap {
                seed,
                n_components: 2,
                n_neighbors: 15,
                min_dist: 0.1,
                spread: 1.0,
                metric: Metric::Euclidean,
                n_epochs: None,
                init: Init::Spectral,
            },
        }
    }

    /// Embed `data` (row-major, `n_features` per row) into
    /// `n_components` dimensions. Same input + same params + same seed →
    /// bit-identical output.
    pub fn fit_transform(&self, data: &[f32], n_features: usize) -> Result<Vec<f32>, HolomapError> {
        // --- validation -----------------------------------------------------
        if n_features == 0 || data.is_empty() || !data.len().is_multiple_of(n_features) {
            return Err(HolomapError::BadShape {
                len: data.len(),
                n_features,
            });
        }
        if self.n_components == 0 {
            return Err(HolomapError::InvalidParameter("n_components must be >= 1"));
        }
        if self.n_neighbors < 2 {
            return Err(HolomapError::InvalidParameter("n_neighbors must be >= 2"));
        }
        if self.spread.is_nan() || self.spread <= 0.0 {
            return Err(HolomapError::InvalidParameter("spread must be > 0"));
        }
        if self.min_dist.is_nan() || self.min_dist < 0.0 {
            return Err(HolomapError::InvalidParameter("min_dist must be >= 0"));
        }
        if self.n_epochs == Some(0) {
            return Err(HolomapError::InvalidParameter("n_epochs must be >= 1"));
        }
        let n = data.len() / n_features;
        if n <= self.n_neighbors {
            return Err(HolomapError::TooFewPoints {
                n,
                n_neighbors: self.n_neighbors,
            });
        }
        if let Some(index) = data.iter().position(|x| !x.is_finite()) {
            return Err(HolomapError::NonFiniteInput { index });
        }

        // --- the pipeline; RNG draw order is fixed: init noise, then SGD ----
        let knn = exact_knn(data, n_features, self.n_neighbors, self.metric);
        let calib = smooth_knn(&knn.dists, self.n_neighbors);
        let graph = fuzzy_simplicial_set(&knn, &calib);

        let n_epochs = self.n_epochs.unwrap_or_else(|| default_n_epochs(n));
        let mut rng = SeededRng::new(self.seed);
        let mut embedding = initial_embedding(
            data,
            n_features,
            &graph,
            self.n_components,
            self.init,
            &mut rng,
        );

        let (a, b) = find_ab_params(f64::from(self.spread), f64::from(self.min_dist));
        let schedule = schedule_edges(&graph, n_epochs);
        optimize_embedding(
            &mut embedding,
            self.n_components,
            n,
            &schedule,
            n_epochs,
            a,
            b,
            &mut rng,
        );
        Ok(embedding)
    }

    /// [`ndarray`] front door: embed an `n × n_features` view into an
    /// `n × n_components` array. Same contract as [`Holomap::fit_transform`];
    /// the input is copied to a contiguous row-major buffer first (the view
    /// may be non-standard-layout).
    #[cfg(feature = "ndarray")]
    pub fn fit_transform_array(
        &self,
        data: ndarray::ArrayView2<f32>,
    ) -> Result<ndarray::Array2<f32>, HolomapError> {
        let n_features = data.ncols();
        let flat: Vec<f32> = data.iter().copied().collect(); // row-major, contiguous
        let embedding = self.fit_transform(&flat, n_features)?;
        let n = embedding.len() / self.n_components;
        // never panics: fit_transform returns exactly n * n_components
        Ok(ndarray::Array2::from_shape_vec((n, self.n_components), embedding).unwrap())
    }
}

impl HolomapBuilder {
    /// Output dimensionality (default 2).
    pub fn n_components(mut self, v: usize) -> Self {
        self.inner.n_components = v;
        self
    }
    /// Neighbourhood size for the kNN graph (default 15). Larger values
    /// favour global structure, smaller values local detail.
    pub fn n_neighbors(mut self, v: usize) -> Self {
        self.inner.n_neighbors = v;
        self
    }
    /// Minimum spacing between embedded points (default 0.1).
    pub fn min_dist(mut self, v: f32) -> Self {
        self.inner.min_dist = v;
        self
    }
    /// Scale of the embedded cloud relative to `min_dist` (default 1.0).
    pub fn spread(mut self, v: f32) -> Self {
        self.inner.spread = v;
        self
    }
    /// Distance metric for the kNN stage (default [`Metric::Euclidean`]).
    pub fn metric(mut self, v: Metric) -> Self {
        self.inner.metric = v;
        self
    }
    /// Optimization epochs (default: 500 up to 10k points, 200 above).
    pub fn n_epochs(mut self, v: usize) -> Self {
        self.inner.n_epochs = Some(v);
        self
    }
    /// Initialization strategy (default [`Init::Spectral`]).
    pub fn init(mut self, v: Init) -> Self {
        self.inner.init = v;
        self
    }
    /// Finalize into a [`Holomap`].
    pub fn build(self) -> Holomap {
        self.inner
    }

    /// Convenience: build and fit in one chain.
    pub fn fit_transform(self, data: &[f32], n_features: usize) -> Result<Vec<f32>, HolomapError> {
        self.inner.fit_transform(data, n_features)
    }

    /// Convenience: build and fit an [`ndarray`] view in one chain.
    #[cfg(feature = "ndarray")]
    pub fn fit_transform_array(
        self,
        data: ndarray::ArrayView2<f32>,
    ) -> Result<ndarray::Array2<f32>, HolomapError> {
        self.inner.fit_transform_array(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Three tight 5-d gaussian-ish blobs, 12 points each, deterministic.
    fn blobs() -> Vec<f32> {
        let centers = [[0.0_f32; 5], [10.0; 5], [-10.0; 5]];
        let mut data = Vec::with_capacity(36 * 5);
        for (c, center) in centers.iter().enumerate() {
            for p in 0..12u32 {
                for f in 0..5u32 {
                    let h = (p * 31 + f * 7 + c as u32 * 131) % 17;
                    data.push(center[f as usize] + 0.1 * h as f32 / 17.0);
                }
            }
        }
        data
    }

    #[test]
    fn fit_transform_shape_and_finiteness() {
        let data = blobs();
        let emb = Holomap::builder(42)
            .n_neighbors(5)
            .fit_transform(&data, 5)
            .unwrap();
        assert_eq!(emb.len(), 36 * 2);
        assert!(emb.iter().all(|x| x.is_finite()));
    }

    /// The `serde` feature serializes the full parameter set — including
    /// the seed, so a persisted config replays to a bit-identical embedding.
    #[cfg(feature = "serde")]
    #[test]
    fn config_serde_round_trip() {
        let data = blobs();
        let config = Holomap::builder(42).n_neighbors(5).min_dist(0.2).build();
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"seed\":42"), "seed must serialize: {json}");
        let back: Holomap = serde_json::from_str(&json).unwrap();
        assert_eq!(
            config.fit_transform(&data, 5).unwrap(),
            back.fit_transform(&data, 5).unwrap(),
            "round-tripped config must replay bit-identically"
        );
    }

    /// THE determinism contract, end to end.
    #[test]
    fn fit_transform_bit_identical_same_seed() {
        let data = blobs();
        let run = |seed: u64| {
            Holomap::builder(seed)
                .n_neighbors(5)
                .n_epochs(50)
                .fit_transform(&data, 5)
                .unwrap()
        };
        assert_eq!(run(42), run(42), "same seed must be bit-identical");
        assert_ne!(run(42), run(43), "different seeds must differ");
    }

    #[test]
    fn rejects_bad_shapes_and_params() {
        let data = blobs();
        // length not a multiple of n_features
        assert!(matches!(
            Holomap::builder(1).fit_transform(&data[..7], 5),
            Err(HolomapError::BadShape { .. })
        ));
        // empty data
        assert!(matches!(
            Holomap::builder(1).fit_transform(&[], 5),
            Err(HolomapError::BadShape { .. })
        ));
        // too few points for the neighbourhood size
        assert!(matches!(
            Holomap::builder(1).n_neighbors(40).fit_transform(&data, 5),
            Err(HolomapError::TooFewPoints { .. })
        ));
        // degenerate params
        assert!(matches!(
            Holomap::builder(1).n_components(0).fit_transform(&data, 5),
            Err(HolomapError::InvalidParameter(_))
        ));
        assert!(matches!(
            Holomap::builder(1).n_neighbors(1).fit_transform(&data, 5),
            Err(HolomapError::InvalidParameter(_))
        ));
        assert!(matches!(
            Holomap::builder(1).spread(0.0).fit_transform(&data, 5),
            Err(HolomapError::InvalidParameter(_))
        ));
    }

    #[cfg(feature = "ndarray")]
    #[test]
    fn ndarray_front_door_matches_slice_api() {
        let flat = blobs();
        let arr = ndarray::Array2::from_shape_vec((36, 5), flat.clone()).unwrap();

        let via_slice = Holomap::builder(42)
            .n_neighbors(5)
            .fit_transform(&flat, 5)
            .unwrap();
        let via_array = Holomap::builder(42)
            .n_neighbors(5)
            .fit_transform_array(arr.view())
            .unwrap();

        assert_eq!(via_array.shape(), &[36, 2]);
        // identical pipeline → bit-identical results through either door
        assert_eq!(via_array.as_slice().unwrap(), via_slice.as_slice());
    }

    #[cfg(feature = "ndarray")]
    #[test]
    fn ndarray_front_door_handles_nonstandard_layout() {
        // a transposed view is non-contiguous; the copy-to-row-major must
        // still produce the correct embedding (36 points × 5 features)
        let flat = blobs();
        let arr = ndarray::Array2::from_shape_vec((5, 36), {
            // build the transpose explicitly so the logical data matches `flat`
            let mut t = vec![0.0_f32; flat.len()];
            for r in 0..36 {
                for c in 0..5 {
                    t[c * 36 + r] = flat[r * 5 + c];
                }
            }
            t
        })
        .unwrap();
        let view = arr.t(); // 36×5 non-standard-layout view over the same data
        let via_array = Holomap::builder(42)
            .n_neighbors(5)
            .fit_transform_array(view)
            .unwrap();
        let via_slice = Holomap::builder(42)
            .n_neighbors(5)
            .fit_transform(&flat, 5)
            .unwrap();
        assert_eq!(via_array.as_slice().unwrap(), via_slice.as_slice());
    }

    #[test]
    fn rejects_non_finite_input() {
        let mut data = blobs();
        let nan_at = 3 * 5 + 2; // row 3, feature 2
        data[nan_at] = f32::NAN;
        assert_eq!(
            Holomap::builder(1).n_neighbors(5).fit_transform(&data, 5),
            Err(HolomapError::NonFiniteInput { index: nan_at })
        );

        let mut data = blobs();
        data[0] = f32::INFINITY;
        assert_eq!(
            Holomap::builder(1).n_neighbors(5).fit_transform(&data, 5),
            Err(HolomapError::NonFiniteInput { index: 0 })
        );
    }
}
