//! Distance metrics. Accumulation in `f64`, result in `f32` — mirrors the
//! reference pipeline (umap-learn computes pairwise distances in float64 and
//! casts to float32 before Stage 2).

/// Distance metric for the kNN stage.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Metric {
    /// Straight-line distance.
    Euclidean,
    /// `1 − cos(a, b)` — magnitude-invariant, the usual choice for text
    /// embeddings.
    Cosine,
}

impl std::str::FromStr for Metric {
    type Err = crate::HolomapError;

    /// Case-insensitive: `"euclidean"` or `"cosine"`. Added for CLI
    /// consumers (first-consumer feedback from the coda gate harness).
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "euclidean" => Ok(Metric::Euclidean),
            "cosine" => Ok(Metric::Cosine),
            _ => Err(crate::HolomapError::InvalidParameter(
                "metric must be \"euclidean\" or \"cosine\"",
            )),
        }
    }
}

impl std::fmt::Display for Metric {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Metric::Euclidean => "euclidean",
            Metric::Cosine => "cosine",
        })
    }
}

/// Euclidean distance between two equal-length vectors.
pub fn euclidean(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len());
    let sq: f64 = a
        .iter()
        .zip(b)
        .map(|(&x, &y)| {
            let d = f64::from(x) - f64::from(y);
            d * d
        })
        .sum();
    sq.sqrt() as f32
}

/// Cosine distance `1 − cos(a, b)`. Magnitude-invariant; matches
/// scikit-learn / umap-learn's `metric="cosine"` values, which Stage 2
/// consumes directly.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len());
    let (mut dot, mut na, mut nb) = (0.0_f64, 0.0_f64, 0.0_f64);
    for (&x, &y) in a.iter().zip(b) {
        let (x, y) = (f64::from(x), f64::from(y));
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    // clamp: cosine distance is mathematically >= 0, but near-parallel
    // vectors can round to -ULP; scikit-learn clips identically
    (1.0 - dot / (na.sqrt() * nb.sqrt())).max(0.0) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metric_parses_from_str_case_insensitive() {
        assert_eq!("euclidean".parse::<Metric>().unwrap(), Metric::Euclidean);
        assert_eq!("cosine".parse::<Metric>().unwrap(), Metric::Cosine);
        assert_eq!("Cosine".parse::<Metric>().unwrap(), Metric::Cosine);
        assert!("manhattan".parse::<Metric>().is_err());
    }

    #[test]
    fn metric_display_round_trips_through_from_str() {
        for m in [Metric::Euclidean, Metric::Cosine] {
            assert_eq!(m.to_string().parse::<Metric>().unwrap(), m);
        }
    }

    #[test]
    fn euclidean_distance_known_values() {
        assert_eq!(euclidean(&[0.0, 0.0], &[3.0, 4.0]), 5.0);
        assert_eq!(euclidean(&[1.0, 2.0, 3.0], &[1.0, 2.0, 3.0]), 0.0);
    }

    #[test]
    fn cosine_distance_known_values() {
        assert_eq!(cosine(&[1.0, 0.0], &[0.0, 1.0]), 1.0); // orthogonal
        assert_eq!(cosine(&[1.0, 0.0], &[2.0, 0.0]), 0.0); // parallel, scale-free
        assert_eq!(cosine(&[1.0, 0.0], &[-3.0, 0.0]), 2.0); // antiparallel
    }
}
