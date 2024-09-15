use std::path::{Path, PathBuf};

pub(crate) fn dirname(path: &Path) -> PathBuf {
    if path.file_name().is_some() {
        path.parent().unwrap_or_else(|| Path::new("")).to_path_buf()
    } else {
        path.to_path_buf()
    }
}

pub(crate) fn resolve_dir(base: &Path, target: &Path) -> PathBuf {
    let base_dir = dirname(base);
    pathdiff::diff_paths(target, base_dir).expect("should resolve relative path.")
}
