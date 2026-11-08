fn main() {
    println!("cargo:rerun-if-changed=dist");
    assert!(
        std::path::Path::new("dist/index.html").is_file(),
        "Build the frontend before compiling the server: npm --prefix frontend run build"
    );
}
