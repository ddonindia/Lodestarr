use std::process::Command;
use std::path::Path;

fn main() {
    // Re-run this script if frontend source changes
    println!("cargo:rerun-if-changed=web/src");
    println!("cargo:rerun-if-changed=web/package.json");
    println!("cargo:rerun-if-changed=web/index.html");

    let dist_path = Path::new("web/dist");

    // Check if dist folder exists, if not, build it
    if !dist_path.exists() {
        println!("cargo:warning=Web assets missing (web/dist). Building frontend...");
        
        // npm install
        let install_status = Command::new("npm")
            .args(&["install"])
            .current_dir("web")
            .status()
            .expect("Failed to run 'npm install'. Is npm installed?");
        
        if !install_status.success() {
            panic!("'npm install' failed. Please check your node setup.");
        }

        // npm run build
        // Note: We use the full path to tsc via npm run or we can rely on npm's path resolution.
        // If 'npm run build' fails, we might need to adjust the command in package.json
        let build_status = Command::new("npm")
            .args(&["run", "build"])
            .current_dir("web")
            .status()
            .expect("Failed to run 'npm run build'.");
        
        if !build_status.success() {
             panic!("'npm run build' failed. Check the web directory.");
        }
        
        println!("cargo:warning=Frontend build completed successfully.");
    }
}
