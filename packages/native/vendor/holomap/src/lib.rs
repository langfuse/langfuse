//! # holomap — deterministic UMAP
//!
//! *The bulk, on the boundary.* The holographic principle says the
//! information of an N-dimensional volume can be encoded on its
//! (N−1)-dimensional surface. `holomap` does that for your data:
//! UMAP-class dimensionality reduction with one non-negotiable contract —
//!
//! **Same input + same params + same seed → bit-identical embedding**
//! (on the same platform/toolchain; cross-platform runs are structurally
//! identical, with floats differing at ULP level).
//!
//! There is no unseeded constructor. By design, none will ever exist.
//!
//! ## Validation
//!
//! Every stage is parity-verified against the references: exact kNN + fuzzy
//! simplicial set vs umap-learn 0.5.12 fixtures, spectral initialization
//! (dense + Lanczos eigensolvers) vs scipy, and the end-to-end embedding vs
//! umap-learn's trustworthiness(k=15) on blobs and swiss roll (within 0.05;
//! swiss roll edges the reference). The determinism gate byte-compares
//! `fit_transform` double-runs in CI.
//!
//! ## Quick start
//!
//! ```
//! use holomap::Holomap;
//!
//! // 40 points on a noisy 4-d lattice, row-major
//! let data: Vec<f32> = (0..160).map(|i| (i % 7) as f32 + 0.01 * i as f32).collect();
//! let embedding = Holomap::builder(42)      // seed is REQUIRED — by design
//!     .n_neighbors(5)
//!     .fit_transform(&data, 4)
//!     .unwrap();
//! assert_eq!(embedding.len(), 40 * 2);      // n_components defaults to 2
//! ```

#![warn(missing_docs)]

mod api;
mod components;
mod curve;
mod eigen;
mod fmath;
mod fuzzy;
mod knn;
mod metric;
mod rng;
mod sgd;
mod smooth_knn;
mod sparse;
mod spectral;

pub use api::{Holomap, HolomapBuilder, HolomapError};
pub use metric::Metric;
pub use spectral::Init;

/// The contract, stated as a constant since commit one. The real enforcement
/// is the end-to-end double-run test on [`Holomap::fit_transform`] plus the
/// CI determinism job (full test suite twice).
pub const DETERMINISM_CONTRACT: &str =
    "same input + same params + same seed => bit-identical embedding";
