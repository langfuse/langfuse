//! Connected-component labeling over a CSR graph — deterministic BFS in
//! ascending vertex order, so labels follow first-seen order exactly like
//! scipy's `connected_components` (component 0 contains vertex 0).

use crate::sparse::Csr;

/// Component labels per vertex plus the component count.
pub struct Components {
    pub n_components: usize,
    pub labels: Vec<u32>,
}

pub fn connected_components(csr: &Csr) -> Components {
    const UNLABELED: u32 = u32::MAX;
    let mut labels = vec![UNLABELED; csr.n];
    let mut n_components = 0_u32;
    let mut queue = Vec::new();
    for start in 0..csr.n {
        if labels[start] != UNLABELED {
            continue;
        }
        labels[start] = n_components;
        queue.push(start);
        while let Some(v) = queue.pop() {
            let (neighbours, _) = csr.row(v);
            for &u in neighbours {
                if labels[u as usize] == UNLABELED {
                    labels[u as usize] = n_components;
                    queue.push(u as usize);
                }
            }
        }
        n_components += 1;
    }
    Components {
        n_components: n_components as usize,
        labels,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fuzzy::FuzzyGraph;

    fn csr(n: usize, edges: &[(u32, u32)]) -> Csr {
        // symmetric, sorted COO from undirected edge list
        let mut coo: Vec<(u32, u32)> = edges.iter().flat_map(|&(a, b)| [(a, b), (b, a)]).collect();
        coo.sort_unstable();
        Csr::from_fuzzy(&FuzzyGraph {
            n,
            rows: coo.iter().map(|&(r, _)| r).collect(),
            cols: coo.iter().map(|&(_, c)| c).collect(),
            vals: vec![1.0; coo.len()],
        })
    }

    #[test]
    fn single_component_path() {
        let c = connected_components(&csr(3, &[(0, 1), (1, 2)]));
        assert_eq!(c.n_components, 1);
        assert_eq!(c.labels, vec![0, 0, 0]);
    }

    #[test]
    fn two_components_first_seen_labeling() {
        // {0, 3} and {1, 2}: vertex 0's component is label 0, vertex 1's is 1
        let c = connected_components(&csr(4, &[(0, 3), (1, 2)]));
        assert_eq!(c.n_components, 2);
        assert_eq!(c.labels, vec![0, 1, 1, 0]);
    }

    #[test]
    fn isolated_vertex_gets_own_component() {
        let c = connected_components(&csr(3, &[(0, 1)]));
        assert_eq!(c.n_components, 2);
        assert_eq!(c.labels, vec![0, 0, 1]);
    }
}
