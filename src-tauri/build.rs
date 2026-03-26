fn main() {
    // ビルド時のプロジェクトルートをバイナリに埋め込む
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let project_root = std::path::Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .to_string_lossy()
        .to_string();
    println!("cargo:rustc-env=AGENTNEST_ROOT={}", project_root);

    // package.jsonのバージョン変更で再コンパイルをトリガー
    println!("cargo:rerun-if-changed=../package.json");

    tauri_build::build();
}
