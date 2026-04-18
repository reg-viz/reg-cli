use std::path::{Path, PathBuf};

pub(crate) fn dirname(path: &Path) -> PathBuf {
    if path.file_name().is_some() {
        path.parent().unwrap_or_else(|| Path::new("")).to_path_buf()
    } else {
        path.to_path_buf()
    }
}

/// Compute `target` relative to `base`'s directory.
///
/// `pathdiff::diff_paths` returns `None` when one path is absolute and the
/// other is relative (e.g. user ran reg-cli with a relative fixture dir but
/// an absolute report path). Historically this panicked. To be robust we
/// canonicalize both sides to absolute via the current working directory
/// before diffing; if diff still fails, return the target unchanged.
pub(crate) fn resolve_dir(base: &Path, target: &Path) -> PathBuf {
    let base_dir = dirname(base);

    if base_dir.is_absolute() == target.is_absolute() {
        if let Some(p) = pathdiff::diff_paths(target, &base_dir) {
            return p;
        }
    }

    // Mixed absolute/relative — try to normalize through $CWD.
    let cwd = std::env::current_dir().unwrap_or_default();
    let abs_base = if base_dir.is_absolute() {
        base_dir.clone()
    } else {
        cwd.join(&base_dir)
    };
    let abs_target = if target.is_absolute() {
        target.to_path_buf()
    } else {
        cwd.join(target)
    };
    pathdiff::diff_paths(&abs_target, &abs_base).unwrap_or_else(|| target.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_relative() {
        let r = resolve_dir(Path::new("a/b/reg.json"), Path::new("a/c/diff"));
        assert_eq!(r, Path::new("../c/diff"));
    }

    #[test]
    fn both_absolute() {
        let r = resolve_dir(Path::new("/a/b/reg.json"), Path::new("/a/c/diff"));
        assert_eq!(r, Path::new("../c/diff"));
    }

    #[test]
    fn mixed_absolute_base_relative_target_no_panic() {
        // Prior to the fix this panicked with `pathdiff returned None`.
        let _ = resolve_dir(Path::new("/tmp/out/reg.json"), Path::new("fixtures/actual"));
    }

    #[test]
    fn mixed_relative_base_absolute_target_no_panic() {
        let _ = resolve_dir(Path::new("bench/reg.json"), Path::new("/tmp/actual"));
    }
}
