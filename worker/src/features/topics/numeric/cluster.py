"""Bounded, credential-free numerical stage. One JSON request on stdin."""

import json
import sys

import hdbscan
import numpy as np
import umap


def main():
    request = json.load(sys.stdin)
    vectors = np.asarray(request["embeddings"], dtype=np.float64)
    if vectors.ndim != 2 or not np.isfinite(vectors).all():
        raise ValueError("Expected a finite embedding matrix")
    norms = np.linalg.norm(vectors, axis=1)
    if np.any(norms < 1e-12):
        raise ValueError("Zero embedding")
    vectors = vectors / norms[:, None]
    count = len(vectors)
    if count < request["minimumCount"]:
        print(json.dumps({"status": "insufficient_data", "labels": [], "coordinates": []}))
        return
    if len(np.unique(np.round(vectors, 8), axis=0)) < 2:
        print(json.dumps({"status": "no_topics", "labels": [-1] * count, "coordinates": [[0, 0]] * count}))
        return
    neighbors = min(count - 1, 15, max(3, count // 3))
    reduced = umap.UMAP(
        n_components=min(10, count - 2, vectors.shape[1]),
        n_neighbors=neighbors,
        min_dist=0,
        metric="cosine",
        random_state=42,
        n_jobs=1,
        init="random",
    ).fit_transform(vectors)
    labels = hdbscan.HDBSCAN(
        min_cluster_size=request["minClusterSize"],
        min_samples=request["minSamples"],
        metric="euclidean",
        cluster_selection_method="eom",
        allow_single_cluster=False,
    ).fit_predict(reduced)
    coordinates = umap.UMAP(
        n_components=2,
        n_neighbors=neighbors,
        metric="cosine",
        random_state=42,
        n_jobs=1,
        init="random",
    ).fit_transform(vectors)
    print(json.dumps({
        "status": "complete" if np.any(labels >= 0) else "no_topics",
        "labels": labels.tolist(),
        "coordinates": coordinates.tolist(),
    }, allow_nan=False))


if __name__ == "__main__":
    main()
