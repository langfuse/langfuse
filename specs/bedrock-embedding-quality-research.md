# Bedrock embedding quality for Topics

Historical research from 2026-09-23. Published benchmark results, not a Topics quality evaluation. These results have not been reverified during documentation cleanup; this note makes no claim about current model availability or rankings.

## Pinned clustering evidence

The original analysis compared the same eleven legacy English clustering tasks in MTEB results commit `fe1eb0571d7c1c261d3cb892c558477451ba5232`:

| Model                                                                                                                                                                       | Dimensions | Mean V-measure (0–100) |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | ---------------------: |
| [Cohere Embed English v3](https://github.com/embeddings-benchmark/results/tree/fe1eb0571d7c1c261d3cb892c558477451ba5232/results/Cohere__Cohere-embed-english-v3.0/external) |       1024 |                  47.43 |
| [Titan Text Embeddings V2](https://github.com/embeddings-benchmark/results/tree/fe1eb0571d7c1c261d3cb892c558477451ba5232/results/amazon__Titan-text-embeddings-v2/external) |       1024 |                  40.40 |

The recorded comparison found matching dataset revisions and higher Cohere scores on all eleven tasks. Missing MTEB-version and full invocation metadata prevent calling this a controlled comparison. The [Cohere v4 directory at that snapshot](https://github.com/embeddings-benchmark/results/tree/fe1eb0571d7c1c261d3cb892c558477451ba5232/results/Cohere__Cohere-embed-v4.0/1) contained retrieval results but no clustering results. Retrieval performance alone does not establish a Topics clustering winner.

To reproduce: read `scores.test[0].v_measure` (or legacy `test.v_measure`), average these eleven tasks and multiply by 100: ArxivClusteringP2P, ArxivClusteringS2S, BiorxivClusteringP2P, BiorxivClusteringS2S, MedrxivClusteringP2P, MedrxivClusteringS2S, RedditClustering, RedditClusteringP2P, StackExchangeClustering, StackExchangeClusteringP2P and TwentyNewsgroupsClustering. No inference credentials are needed to recompute the published averages.

## Evaluate on Topics data

Freeze representative facet summaries and hold the summarizer and clustering algorithm fixed when comparing embeddings. Include paraphrases, similar and rare topics, ambiguous requests and numerical differences. Review incorrect merges and cluster coherence, then test assignment and new-topic rejection on held-out summaries. Measure coverage, outlier rate, resampling stability, latency and cost; add pairwise precision/recall or ARI/NMI where labels exist. Recalibrate thresholds per embedding space. Silhouette alone cannot compare quality across different vector spaces. Keep comparison vectors separate from serving data. The original research did not run this Topics comparison; synthetic fixtures are not representative quality proof.
