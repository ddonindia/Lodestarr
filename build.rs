use std::path::Path;
use std::process::Command;

fn main() {
    // Re-run this script if frontend source changes
    println!("cargo:rerun-if-changed=web/src");
    println!("cargo:rerun-if-changed=web/package.json");
    println!("cargo:rerun-if-changed=web/package-lock.json");
    println!("cargo:rerun-if-changed=web/index.html");
    println!("cargo:rerun-if-changed=web/tsconfig.json");
    println!("cargo:rerun-if-changed=web/vite.config.ts");

    // Check code formatting (matches GitHub Actions)
    check_formatting();

    // NOTE: Clippy check is NOT done here because it causes recursive builds
    // (clippy needs to compile, which triggers build.rs again)
    // Run 'cargo clippy -- -D warnings' manually before pushing

    // Skip frontend build if SKIP_FRONTEND_BUILD is set (used in cross-compilation)
    if std::env::var("SKIP_FRONTEND_BUILD").is_ok() {
        println!("cargo:warning=SKIP_FRONTEND_BUILD set, skipping frontend build");
        return;
    }

    // Always build the frontend to ensure it's up-to-date
    build_frontend();
}

fn check_formatting() {
    // Only check formatting in debug builds to speed up release builds
    if std::env::var("PROFILE").unwrap_or_default() == "release" {
        return;
    }

    println!("cargo:warning=Checking code formatting...");
    let fmt_status = Command::new("cargo")
        .args(["fmt", "--", "--check"])
        .status();

    match fmt_status {
        Ok(status) if !status.success() => {
            panic!("Code formatting check failed! Run 'cargo fmt' to fix formatting issues.");
        }
        Err(e) => {
            println!("cargo:warning=Could not run cargo fmt: {}", e);
        }
        _ => {
            println!("cargo:warning=✓ Code formatting check passed.");
        }
    }
}

fn build_frontend() {
    println!("cargo:warning=Building web UI...");

    let web_dir = Path::new("web");
    if !web_dir.exists() {
        println!("cargo:warning=web directory not found, skipping frontend build");
        return;
    }

    // Use npm.cmd on Windows, npm on Unix-like systems
    let npm_cmd = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };

    // Check if node_modules exists, if not run npm install
    let node_modules = web_dir.join("node_modules");
    if !node_modules.exists() {
        println!("cargo:warning=Installing npm dependencies...");
        let install_status = Command::new(npm_cmd)
            .args(["install"])
            .current_dir("web")
            .status()
            .expect("Failed to run 'npm install'. Is npm installed?");

        if !install_status.success() {
            panic!("'npm install' failed. Please check your node setup.");
        }
    }

    // npm run build
    println!("cargo:warning=Building frontend with vite...");
    let build_status = Command::new(npm_cmd)
        .args(["run", "build"])
        .current_dir("web")
        .status()
        .expect("Failed to run 'npm run build'.");

    if !build_status.success() {
        panic!("'npm run build' failed. Check the web directory.");
    }

    // Verify dist was created
    let dist_path = Path::new("web/dist");
    if !dist_path.exists() {
        panic!("Frontend build completed but web/dist was not created!");
    }

    println!("cargo:warning=✓ Frontend build completed successfully.");
}
