fn main() {
    // package.jsonのバージョン変更で再コンパイルをトリガー
    println!("cargo:rerun-if-changed=../package.json");

    tauri_build::build();
}
