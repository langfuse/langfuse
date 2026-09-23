use hdbscan_rs::{ClusterSelectionMethod, Hdbscan, HdbscanParams, Metric as ClusterMetric};
use holomap::{Holomap, Init, Metric};
use napi::{Error, Result, Status};
use napi_derive::napi;
use ndarray::Array2;

#[napi(object)]
#[derive(Debug)]
pub struct TopicClusteringSettings {
    pub minimum_count: u32,
    pub min_cluster_size: u32,
    /// Number of neighboring samples, excluding the sample itself.
    pub min_samples: u32,
}

#[napi(object)]
#[derive(Debug, PartialEq)]
pub struct TopicClusteringResult {
    pub status: String,
    pub labels: Vec<i32>,
    pub coordinates: Vec<Vec<f64>>,
}

/// Fits topic clusters and a separate 2D display projection in memory.
/// This is CPU-bound and synchronous; call it in a killable child process.
#[napi]
pub fn cluster_topic_embeddings(
    embeddings: Vec<Vec<f64>>,
    settings: TopicClusteringSettings,
) -> Result<TopicClusteringResult> {
    if settings.minimum_count < 3 || settings.min_cluster_size < 2 || settings.min_samples < 1 {
        return Err(invalid("Invalid topic clustering settings"));
    }
    let count = embeddings.len();
    let dimensions = embeddings.first().map_or(0, Vec::len);
    let mut vectors = Vec::new();
    let mut first_rounded = Vec::new();
    let mut all_identical = true;
    for (row_index, row) in embeddings.into_iter().enumerate() {
        if dimensions == 0 || row.len() != dimensions || row.iter().any(|value| !value.is_finite())
        {
            return Err(invalid(
                "Expected a finite embedding matrix with equal dimensions",
            ));
        }
        let norm = row.iter().fold(0.0_f64, |norm, value| norm.hypot(*value));
        if !norm.is_finite() || norm < 1e-12 {
            return Err(invalid("Expected nonzero embedding vectors"));
        }
        for (column, value) in row.into_iter().enumerate() {
            let normalized = value / norm;
            let rounded = (normalized * 1e8).round_ties_even();
            if row_index == 0 {
                first_rounded.push(rounded);
            } else if rounded != first_rounded[column] {
                all_identical = false;
            }
            vectors.push(normalized as f32);
        }
    }
    if count < settings.minimum_count as usize {
        return Ok(TopicClusteringResult {
            status: "insufficient_data".to_owned(),
            labels: Vec::new(),
            coordinates: Vec::new(),
        });
    }
    if all_identical {
        return Ok(TopicClusteringResult {
            status: "no_topics".to_owned(),
            labels: vec![-1; count],
            coordinates: vec![vec![0.0, 0.0]; count],
        });
    }

    let neighbors = (count - 1).min(15).min((count / 3).max(3));
    let reduced_dimensions = 10.min(count - 2).min(dimensions);
    let reduced = reduce(&vectors, dimensions, reduced_dimensions, neighbors, 0.0)?;
    let data = Array2::from_shape_vec(
        (count, reduced_dimensions),
        reduced.into_iter().map(f64::from).collect(),
    )
    .map_err(|error| failure(error.to_string()))?;
    let mut clusterer = Hdbscan::new(HdbscanParams {
        min_cluster_size: settings.min_cluster_size as usize,
        // hdbscan-rs includes the sample itself in the neighbor count.
        min_samples: Some((settings.min_samples as usize + 1).min(count)),
        metric: ClusterMetric::Euclidean,
        cluster_selection_method: ClusterSelectionMethod::Eom,
        allow_single_cluster: false,
        ..HdbscanParams::default()
    });
    let labels = clusterer
        .fit_predict(&data.view())
        .map_err(|error| failure(error.to_string()))?;
    let coordinates = reduce(&vectors, dimensions, 2, neighbors, 0.1)?
        .as_chunks::<2>()
        .0
        .iter()
        .map(|point| point.iter().copied().map(f64::from).collect())
        .collect();

    Ok(TopicClusteringResult {
        status: if labels.iter().any(|label| *label >= 0) {
            "complete"
        } else {
            "no_topics"
        }
        .to_owned(),
        labels,
        coordinates,
    })
}

fn reduce(
    vectors: &[f32],
    dimensions: usize,
    output_dimensions: usize,
    neighbors: usize,
    min_dist: f32,
) -> Result<Vec<f32>> {
    let reduced = Holomap::builder(42)
        .n_components(output_dimensions)
        .n_neighbors(neighbors)
        .min_dist(min_dist)
        .metric(Metric::Cosine)
        .init(Init::Random)
        .fit_transform(vectors, dimensions)
        .map_err(|error| failure(error.to_string()))?;
    if reduced.len() != vectors.len() / dimensions * output_dimensions
        || reduced.iter().any(|value| !value.is_finite())
    {
        return Err(failure("Topic reduction returned invalid coordinates"));
    }
    Ok(reduced)
}

fn invalid(message: impl Into<String>) -> Error {
    Error::new(Status::InvalidArg, message.into())
}

fn failure(message: impl Into<String>) -> Error {
    Error::new(Status::GenericFailure, message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> TopicClusteringSettings {
        TopicClusteringSettings {
            minimum_count: 10,
            min_cluster_size: 5,
            min_samples: 2,
        }
    }

    fn separated_groups() -> Vec<Vec<f64>> {
        (0..60)
            .map(|index| {
                let mut vector = vec![0.02; 6];
                vector[index / 20] = 1.0;
                vector[3] = (index % 20) as f64 * 0.001;
                vector[4] = ((index * 7) % 19) as f64 * 0.001;
                vector
            })
            .collect()
    }

    #[test]
    fn rejects_malformed_embeddings_before_reduction() {
        for embeddings in [
            vec![vec![0.0, 0.0]; 10],
            vec![vec![f64::NAN, 1.0]; 10],
            vec![vec![f64::INFINITY, 1.0]; 10],
            vec![vec![]; 10],
            vec![vec![1.0, 0.0], vec![1.0]],
        ] {
            assert_eq!(
                cluster_topic_embeddings(embeddings, settings())
                    .unwrap_err()
                    .status,
                Status::InvalidArg
            );
        }
    }

    #[test]
    fn produces_reproducible_clusters_and_projection() {
        let first = cluster_topic_embeddings(separated_groups(), settings()).unwrap();
        let second = cluster_topic_embeddings(separated_groups(), settings()).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.status, "complete");
    }

    #[test]
    fn minimum_cluster_size_can_leave_every_point_unassigned() {
        let mut settings = settings();
        settings.min_cluster_size = 100;
        let result = cluster_topic_embeddings(separated_groups(), settings).unwrap();
        assert_eq!(result.status, "no_topics");
        assert_eq!(result.labels, vec![-1; 60]);
        assert_eq!(result.coordinates.len(), 60);
    }
}
