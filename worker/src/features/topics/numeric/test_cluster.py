"""Offline numerical integration checks; run with the isolated Topics Python."""
import json
import pathlib
import subprocess
import sys
import unittest

import numpy as np


class NumericPipelineTest(unittest.TestCase):
    def run_fit(self, vectors):
        result = subprocess.run(
            [sys.executable, str(pathlib.Path(__file__).with_name("cluster.py"))],
            input=json.dumps({"embeddings": vectors, "minimumCount": 100, "minClusterSize": 15, "minSamples": 5, "seed": 42}),
            text=True, capture_output=True, check=True, timeout=120,
        )
        return json.loads(result.stdout)

    def test_distinct_populations_and_no_information(self):
        rng = np.random.default_rng(42)
        vectors = np.concatenate([rng.normal(center, 0.025, (60, 16)) for center in np.eye(16)[:2]])
        result = self.run_fit(vectors.tolist())
        self.assertEqual(result["status"], "complete")
        self.assertEqual(len(result["labels"]), 120)
        self.assertGreaterEqual(len(set(result["labels"]) - {-1}), 2)
        self.assertTrue(np.isfinite(result["coordinates"]).all())
        self.assertEqual(self.run_fit(vectors[:10].tolist())["status"], "insufficient_data")
        self.assertEqual(self.run_fit([[1.0, 0.0]] * 100)["status"], "no_topics")


if __name__ == "__main__":
    unittest.main()
