use crate::torznab;
use colored::Colorize;
use futures::future::join_all;

pub async fn perform_search(
    clients: &[(String, torznab::TorznabClient)],
    params: torznab::SearchParams,
) -> Vec<torznab::TorrentResult> {
    // Scatter-gather
    let futures = clients.iter().map(|(name, client)| {
        let p = params.clone();
        let n = name.clone();
        async move {
            match client.search(&p).await {
                Ok(mut res) => {
                    // Tag results with indexer name
                    for r in &mut res {
                        r.indexer = Some(n.clone());
                    }
                    Ok::<Vec<torznab::TorrentResult>, (String, anyhow::Error)>(res)
                }
                Err(e) => Err((n, e)),
            }
        }
    });

    let results_lists = join_all(futures).await;

    let mut all_results = Vec::new();
    for res in results_lists {
        match res {
            Ok(r) => all_results.extend(r),
            Err((name, e)) => eprintln!("{} Indexer '{}' failed: {}", "Warning:".yellow(), name, e),
        }
    }

    sort_results(&mut all_results);

    all_results
}

fn sort_results(results: &mut [torznab::TorrentResult]) {
    results.sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sort_results() {
        let mut results = vec![
            torznab::TorrentResult {
                title: "A".to_string(),
                seeders: Some(10),
                ..Default::default()
            },
            torznab::TorrentResult {
                title: "B".to_string(),
                seeders: Some(50),
                ..Default::default()
            },
            torznab::TorrentResult {
                title: "C".to_string(),
                seeders: None,
                ..Default::default()
            },
        ];

        sort_results(&mut results);

        assert_eq!(results[0].title, "B"); // 50
        assert_eq!(results[1].title, "A"); // 10
        assert_eq!(results[2].title, "C"); // 0 (None)
    }
}
