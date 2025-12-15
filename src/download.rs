use crate::torznab;
use crate::utils::sanitize_filename;
use anyhow::Result;
use colored::Colorize;

pub async fn perform_download(
    client: &torznab::TorznabClient,
    url: &str,
    output: Option<String>,
    magnet: bool,
    title: Option<&str>,
) -> Result<()> {
    // Check if it's a magnet link
    if url.starts_with("magnet:") || magnet {
        let name = if let Some(t) = title {
            format!("{}.magnet", sanitize_filename(t))
        } else if let Some(start) = url.find("dn=") {
            let name_part = &url[start + 3..];
            let end = name_part.find('&').unwrap_or(name_part.len());
            let name = urlencoding::decode(&name_part[..end]).unwrap_or_default();
            format!("{}.magnet", name)
        } else {
            "download.magnet".to_string()
        };

        let filename = if let Some(out) = &output {
            let path = std::path::Path::new(out);
            if path.is_dir() {
                path.join(&name).to_string_lossy().to_string()
            } else {
                out.clone()
            }
        } else {
            name
        };

        std::fs::write(&filename, url)?;
        println!(
            "{} Saved magnet link to {}",
            "✓".green().bold(),
            filename.green()
        );
        return Ok(());
    }

    let name = if let Some(t) = title {
        format!("{}.torrent", sanitize_filename(t))
    } else {
        url.split('/')
            .next_back()
            .and_then(|s| s.split('?').next())
            .filter(|s| !s.is_empty())
            .unwrap_or("download.torrent")
            .to_string()
    };

    let filename = if let Some(out) = &output {
        let path = std::path::Path::new(out);
        if path.is_dir() {
            path.join(&name).to_string_lossy().to_string()
        } else {
            out.clone()
        }
    } else {
        name
    };

    println!("Downloading to {}...", filename.cyan());

    match client.download(url).await {
        Ok(bytes) => {
            std::fs::write(&filename, &bytes)?;
            println!(
                "{} Downloaded {} bytes to {}",
                "✓".green().bold(),
                bytes.len().to_string().cyan(),
                filename.green()
            );
            Ok(())
        }
        Err(e) => {
            println!("{} Download failed: {}", "✗".red(), e);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filename_generation_torrent() {
        let name = "test.torrent";
        let path = std::path::Path::new("/downloads");
        let joined = path.join(name);
        assert_eq!(joined.to_string_lossy(), "/downloads/test.torrent");
    }

    #[test]
    fn test_magnet_naming() {
        let title = "My Movie (2025)";
        let safe = sanitize_filename(title);
        assert_eq!(safe, "My_Movie__2025_");
        let fname = format!("{}.magnet", safe);
        assert_eq!(fname, "My_Movie__2025_.magnet");
    }
}
