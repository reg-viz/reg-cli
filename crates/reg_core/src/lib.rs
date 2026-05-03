mod dir;
mod report;
pub mod tracing_layer;

use image_diff_rs::{DiffOption, DiffOutput, EncodeFormat, ImageDiffError};
use rayon::{prelude::*, ThreadPoolBuilder};
use report::create_reports;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};
use tracing::{info, info_span, instrument};

use thiserror::Error;

pub use report::JsonReport;
pub use tracing_layer::{clear_trace_data, get_trace_data_json, init_tracing, set_js_trace_context, SpanData, TraceData};
pub use url::*;

#[derive(Error, Debug)]
pub enum CompareError {
    #[error("file io error, {0}")]
    File(#[from] std::io::Error),
    #[error("image diff error, {0}")]
    ImageDiff(#[from] ImageDiffError),
    #[error("unknown error")]
    Unknown,
}

static SUPPORTED_EXTENTIONS: [&str; 7] = ["tiff", "jpeg", "jpg", "gif", "png", "bmp", "webp"];

/// Per-file outcome of the parallel diff loop. We never propagate
/// per-image errors out of the rayon closure — instead each failure is
/// logged to stderr, fired as a `compare-event` of kind "fail", and
/// folded into the `failedItems` bucket downstream. This matches classic
/// reg-cli's tolerance (it forks per image, so a single corrupt PNG
/// can't sink the whole batch).
enum ImageOutcome {
    Ok(DiffOutput),
    Failed,
}

static DEFAULT_JSON_PATH: &'static str = "./reg.json";
static DEFAULT_REPORT_PATH: &'static str = "./report.html";

/// Magic line prefix that the JS host (`js/entry.ts`, `js/worker.ts`) parses
/// out of the Wasm's stderr stream to produce live `compare` events on the
/// `EventEmitter` returned by `compare()`. Mirrors classic reg-cli's
/// `ProcessAdaptor` which fires per-file events as each image finishes
/// diffing, so reg-suit spinners and progress UIs animate.
///
/// Format (one event per line, TAB-delimited, newline-terminated):
///
///     __REG_CLI_EVT__\t{"type":"pass|fail|new|delete","path":"..."}\n
///
/// Everything else on stderr is forwarded through to `console.error` on the
/// host, so actual errors still reach users.
const PROGRESS_MARKER: &str = "__REG_CLI_EVT__";

/// Print a live progress event to stderr. Uses JSON for the payload so that
/// arbitrary characters in `path` (Unicode, backslashes on Windows, tabs,
/// newlines) don't break the downstream parser. Flushing here would be
/// nice-to-have but `eprintln!` already flushes to the WASI fd per-call.
fn emit_progress(kind: &'static str, path: &str) {
    let payload = serde_json::json!({ "type": kind, "path": path });
    eprintln!("{}\t{}", PROGRESS_MARKER, payload);
}

fn is_supported_extension(path: &Path) -> bool {
    if let Some(extension) = path.extension() {
        if let Some(ext_str) = extension.to_str() {
            return SUPPORTED_EXTENTIONS.contains(&ext_str.to_lowercase().as_str());
        }
    }
    false
}

#[derive(Debug)]
pub(crate) struct DetectedImages {
    pub(crate) expected: BTreeSet<PathBuf>,
    pub(crate) actual: BTreeSet<PathBuf>,
    pub(crate) deleted: BTreeSet<PathBuf>,
    pub(crate) new: BTreeSet<PathBuf>,
}

/// Options for configuring the comparison process.
///
/// # Fields
///
/// * `report` - An optional path to a report file.
/// * `threshold_rate` - An optional threshold rate for comparison.
/// * `threshold_pixel` - An optional threshold pixel count for comparison.
/// * `enable_antialias` - An optional flag to enable or disable antialiasing.
#[derive(Debug)]
pub struct Options<'a> {
    pub report: Option<&'a Path>,
    /// Where to write the JUnit XML report. `None` means no junit output.
    pub junit_report: Option<&'a Path>,
    pub json: Option<&'a Path>,
    /// Mirror of classic reg-cli's `-E / --extendedErrors`. Affects only the
    /// JUnit XML: new/deleted items become `<failure message="newItem"/>` /
    /// `"deletedItem"` instead of silent passed testcases. Non-junit exit
    /// code behaviour is still driven by the CLI wrapper itself.
    pub extended_errors: Option<bool>,
    // update?: boolean,
    pub url_prefix: Option<url::Url>,
    pub matching_threshold: Option<f32>,
    pub threshold_rate: Option<f32>,
    pub threshold_pixel: Option<u64>,
    pub concurrency: Option<usize>,
    pub enable_antialias: Option<bool>,
    /// Format for the generated diff images. `None` keeps the default
    /// (WebP lossless). Setting `Some(Png)` makes the output apples-to-apples
    /// with the classic JS implementation.
    pub diff_image_format: Option<DiffImageFormat>,
    /// Mirror of classic reg-cli's `--additionalDetection client`. When set,
    /// the HTML report's `ximgdiffConfig.enabled` is `true` and the report UI
    /// runs a second-pass pixel detector in the browser.
    pub enable_client_additional_detection: Option<bool>,
}

/// User-facing mirror of `image_diff_rs::EncodeFormat` so that `reg_core`
/// consumers don't have to depend on image-diff-rs directly.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub enum DiffImageFormat {
    #[default]
    Webp,
    Png,
}

impl From<DiffImageFormat> for EncodeFormat {
    fn from(f: DiffImageFormat) -> Self {
        match f {
            DiffImageFormat::Webp => EncodeFormat::Webp,
            DiffImageFormat::Png => EncodeFormat::Png,
        }
    }
}

impl DiffImageFormat {
    fn extension(self) -> &'static str {
        match self {
            DiffImageFormat::Webp => "webp",
            DiffImageFormat::Png => "png",
        }
    }
}

impl<'a> Default for Options<'a> {
    fn default() -> Self {
        Self {
            report: None,
            junit_report: None,
            json: Some(Path::new(DEFAULT_JSON_PATH)),
            extended_errors: None,
            url_prefix: None,
            matching_threshold: Some(0.0),
            threshold_rate: None,
            threshold_pixel: None,
            concurrency: Some(4),
            enable_antialias: None,
            diff_image_format: None,
            enable_client_additional_detection: None,
        }
    }
}

/// Runs the comparison process.
///
/// # Arguments
///
/// * `actual_dir` - The directory containing the actual images.
/// * `expected_dir` - The directory containing the expected images.
/// * `diff_dir` - The directory where the diff images will be saved.
/// * `options` - The options for configuring the comparison process.
#[instrument(skip(options), fields(actual_dir = %actual_dir.as_ref().display(), expected_dir = %expected_dir.as_ref().display(), diff_dir = %diff_dir.as_ref().display()))]
pub fn run(
    actual_dir: impl AsRef<Path>,
    expected_dir: impl AsRef<Path>,
    diff_dir: impl AsRef<Path>,
    options: Options,
) -> Result<JsonReport, CompareError> {
    let actual_dir = actual_dir.as_ref();
    let expected_dir = expected_dir.as_ref();
    let diff_dir = diff_dir.as_ref();
    let json_path = options.json.unwrap_or_else(|| Path::new(DEFAULT_JSON_PATH));
    let report = options
        .report
        .unwrap_or_else(|| Path::new(DEFAULT_REPORT_PATH));

    info!(
        actual_dir = %actual_dir.display(),
        expected_dir = %expected_dir.display(),
        diff_dir = %diff_dir.display(),
        "Starting image comparison"
    );

    let detected = find_images(&expected_dir, &actual_dir);

    // Emit `new` / `delete` progress events up front — classic reg-cli
    // fires these before the per-image diff loop starts, and reg-suit /
    // spinners depend on live progress. See `emit_progress` for the wire
    // format and `js/entry.ts` for the receiving side.
    for p in &detected.new {
        emit_progress("new", &p.display().to_string());
    }
    for p in &detected.deleted {
        emit_progress("delete", &p.display().to_string());
    }

    let targets: Vec<PathBuf> = detected
        .actual
        .intersection(&detected.expected)
        .cloned()
        .collect();

    // Match classic reg-cli (src/index.js:77): for small image sets the
    // rayon thread-pool spin-up + cross-thread span dance costs more than
    // any parallelism buys. Force single-threaded until we cross the
    // classic's 20-image threshold.
    let concurrency = if targets.len() < 20 {
        1
    } else {
        options.concurrency.unwrap_or(4)
    };
    info!(target_count = targets.len(), concurrency, "Starting parallel image diff");

    let pool = {
        let _pool_span = info_span!("build_thread_pool", num_threads = concurrency).entered();
        ThreadPoolBuilder::new()
            .num_threads(concurrency)
            .build()
            .unwrap()
    };

    let result = {
        let diff_span = info_span!("parallel_image_diff", target_count = targets.len());
        let _diff_guard = diff_span.enter();
        
        // Capture the parent span to propagate to rayon threads
        let parent_span = diff_span.clone();
        
        pool.install(|| {
            // Note: There may be ~20-30ms delay here due to rayon thread scheduling overhead
            // This is especially noticeable in WASI environments
            targets
                .par_iter()
                .map(|path| {
                    // Explicitly set parent span for cross-thread context propagation
                    let image_span = info_span!(parent: parent_span.clone(), "diff_single_image", image = %path.display());
                    let _image_guard = image_span.enter();

                    let actual_path = actual_dir.join(path);
                    let expected_path = expected_dir.join(path);

                    // Per-file failure policy: read OR decode errors are
                    // logged to stderr, classified as "fail" via a live
                    // compare-event, and counted into `failedItems`. We
                    // never propagate them up — one corrupt PNG must not
                    // abort a 1000-image batch (parity with classic
                    // reg-cli, which forks-per-image and tolerates child
                    // crashes individually).
                    let img1 = match std::fs::read(&actual_path) {
                        Ok(b) => b,
                        Err(e) => {
                            eprintln!(
                                "[reg-cli] failed to read actual {}: {}",
                                actual_path.display(),
                                e
                            );
                            emit_progress("fail", &path.display().to_string());
                            return (path.clone(), ImageOutcome::Failed);
                        }
                    };
                    let img2 = match std::fs::read(&expected_path) {
                        Ok(b) => b,
                        Err(e) => {
                            eprintln!(
                                "[reg-cli] failed to read expected {}: {}",
                                expected_path.display(),
                                e
                            );
                            emit_progress("fail", &path.display().to_string());
                            return (path.clone(), ImageOutcome::Failed);
                        }
                    };

                    let res = {
                        let _calc_span = info_span!(parent: image_span.clone(), "calculate_diff",
                            actual_size = img1.len(),
                            expected_size = img2.len()
                        ).entered();
                        match image_diff_rs::diff(
                            img1,
                            img2,
                            &DiffOption {
                                threshold: options.matching_threshold,
                                include_anti_alias: Some(!options.enable_antialias.unwrap_or_default()),
                                encode_format: options
                                    .diff_image_format
                                    .map(EncodeFormat::from),
                            },
                        ) {
                            Ok(r) => r,
                            Err(e) => {
                                eprintln!(
                                    "[reg-cli] failed to diff {}: {}",
                                    path.display(),
                                    e
                                );
                                emit_progress("fail", &path.display().to_string());
                                return (path.clone(), ImageOutcome::Failed);
                            }
                        }
                    };

                    // Fire the live pass/fail event as early as we can —
                    // right after the pixel-diff completes, before the
                    // caller-thread serialises through `collect`. Classify
                    // here (not in the post-collect loop) so consumers see
                    // progress while other rayon threads are still working
                    // on remaining images.
                    let kind = match &res {
                        DiffOutput::Eq => "pass",
                        DiffOutput::NotEq {
                            diff_count,
                            width,
                            height,
                            ..
                        } => {
                            if is_passed(
                                *width,
                                *height,
                                *diff_count as u64,
                                options.threshold_pixel,
                                options.threshold_rate,
                            ) {
                                "pass"
                            } else {
                                "fail"
                            }
                        }
                    };
                    emit_progress(kind, &path.display().to_string());

                    (path.clone(), ImageOutcome::Ok(res))
                })
                .collect::<Vec<(PathBuf, ImageOutcome)>>()
        })
    };

    let mut differences = BTreeSet::new();
    let mut passed = BTreeSet::new();
    let mut failed = BTreeSet::new();

    for (image_name, item) in result.iter() {
        match item {
            ImageOutcome::Failed => {
                // Per-file read/decode failure: count as failed but
                // don't try to write a diff image (we have no pixels).
                failed.insert(image_name.clone());
            }
            ImageOutcome::Ok(DiffOutput::Eq) => {
                passed.insert(image_name.clone());
            }
            ImageOutcome::Ok(DiffOutput::NotEq {
                diff_count,
                diff_image,
                width,
                height,
            }) => {
                if is_passed(
                    width.clone(),
                    height.clone(),
                    diff_count.clone() as u64,
                    options.threshold_pixel,
                    options.threshold_rate,
                ) {
                    passed.insert(image_name.clone());
                } else {
                    let mut diff_image_name = image_name.clone();
                    failed.insert(image_name.clone());
                    diff_image_name.set_extension(
                        options
                            .diff_image_format
                            .unwrap_or_default()
                            .extension(),
                    );
                    differences.insert(diff_image_name.clone());
                    
                    let diff_path = diff_dir.join(&diff_image_name);
                    if let Some(parent) = diff_path.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| {
                            eprintln!("Failed to create diff directory: {:?}, error: {:?}", parent, e);
                            e
                        })?;
                    }
                    std::fs::write(&diff_path, diff_image).map_err(|e| {
                        eprintln!("Failed to write diff file: {:?}, error: {:?}", diff_path, e);
                        e
                    })?;
                }
            }
        }
    }

    let report = {
        let _report_span = info_span!("create_reports").entered();
        info!(
            passed_count = passed.len(),
            failed_count = failed.len(),
            new_count = detected.new.len(),
            deleted_count = detected.deleted.len(),
            "Creating reports"
        );
        create_reports(report::ReportInput {
            passed,
            failed,
            new: detected.new,
            deleted: detected.deleted,
            actual: detected.actual,
            expected: detected.expected,
            report,
            differences,
            json: json_path,
            actual_dir,
            expected_dir,
            diff_dir,
            from_json: false,
            url_prefix: options.url_prefix,
            diff_image_extention: options
                .diff_image_format
                .unwrap_or_default()
                .extension(),
            enable_client_additional_detection: options
                .enable_client_additional_detection
                .unwrap_or(false),
        })
    };

    if let (Some(html), Some(report_path)) = (report.html, options.report) {
        let _write_span = info_span!("write_report", path = %report_path.display()).entered();
        if let Some(parent) = report_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                eprintln!("Failed to create report directory: {:?}, error: {:?}", parent, e);
                e
            })?;
        }
        std::fs::write(report_path, html).map_err(|e| {
            eprintln!("Failed to write report file: {:?}, error: {:?}", report_path, e);
            e
        })?;
        info!(path = %report_path.display(), "Report written");
    };

    // Persist reg.json to disk. Previously this was done on the JS side after
    // the Wasm returned the string; moving it to Rust makes the contract
    // symmetric with HTML / diff images (reg_core writes every artefact it
    // knows how to produce) and keeps the non-wasm `cargo run` CLI useful.
    {
        let _write_span = info_span!("write_json", path = %json_path.display()).entered();
        if let Some(parent) = json_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let body = serde_json::to_string_pretty(&report.json).map_err(|e| {
            eprintln!("Failed to serialize reg.json: {:?}", e);
            std::io::Error::new(std::io::ErrorKind::Other, e)
        })?;
        std::fs::write(json_path, body + "\n").map_err(|e| {
            eprintln!("Failed to write {:?}: {:?}", json_path, e);
            e
        })?;
    }

    // JUnit XML (optional).
    if let Some(junit_path) = options.junit_report {
        let _write_span = info_span!("write_junit", path = %junit_path.display()).entered();
        if let Some(parent) = junit_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let xml = report::build_junit_xml(
            &report.json,
            options.extended_errors.unwrap_or(false),
        );
        std::fs::write(junit_path, xml).map_err(|e| {
            eprintln!("Failed to write {:?}: {:?}", junit_path, e);
            e
        })?;
    }

    info!("Comparison complete");
    Ok(report.json)
}

/// Re-render the HTML report from an existing `reg.json` WITHOUT running any
/// image comparison. Mirrors classic reg-cli's `-F / --from` mode.
///
/// `json_path` is the source reg.json; `options.report` is where to write
/// the resulting HTML; `options.junit_report` / `options.enable_client_*` are
/// honoured as usual.
pub fn run_from_json(
    json_path: impl AsRef<Path>,
    options: Options,
) -> Result<JsonReport, CompareError> {
    let _root = info_span!("run_from_json", path = %json_path.as_ref().display()).entered();
    let content = std::fs::read_to_string(json_path.as_ref())?;
    let json: JsonReport = serde_json::from_str(&content).map_err(|e| {
        eprintln!("Failed to parse {:?}: {:?}", json_path.as_ref(), e);
        std::io::Error::new(std::io::ErrorKind::InvalidData, e)
    })?;

    let report_path = options
        .report
        .unwrap_or_else(|| Path::new(DEFAULT_REPORT_PATH));
    let out_json_path = options.json.unwrap_or_else(|| Path::new(DEFAULT_JSON_PATH));

    // Rebuild ReportInput fields from the parsed JsonReport. Note: the JSON's
    // actualDir / expectedDir / diffDir are already strings the template
    // expects, so `from_json: true` makes the template use them verbatim
    // rather than re-resolving via `resolve_dir`.
    let report = {
        let _s = info_span!("create_reports_from_json").entered();
        create_reports(report::ReportInput {
            passed: json.passed_items.clone(),
            failed: json.failed_items.clone(),
            new: json.new_items.clone(),
            deleted: json.deleted_items.clone(),
            actual: json.actual_items.clone(),
            expected: json.expected_items.clone(),
            differences: json.diff_items.clone(),
            report: report_path,
            json: out_json_path,
            actual_dir: Path::new(&json.actual_dir),
            expected_dir: Path::new(&json.expected_dir),
            diff_dir: Path::new(&json.diff_dir),
            from_json: true,
            url_prefix: options.url_prefix,
            diff_image_extention: options
                .diff_image_format
                .unwrap_or_default()
                .extension(),
            enable_client_additional_detection: options
                .enable_client_additional_detection
                .unwrap_or(false),
        })
    };

    if let Some(html) = report.html {
        if let Some(parent) = report_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(report_path, html)?;
        info!(path = %report_path.display(), "Report written (from-json mode)");
    }

    if let Some(junit_path) = options.junit_report {
        if let Some(parent) = junit_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(
            junit_path,
            report::build_junit_xml(&report.json, options.extended_errors.unwrap_or(false)),
        )?;
    }

    Ok(report.json)
}

// Recursively collect supported image files under `root`, returning paths
// relative to `root` (not absolute).
//
// We avoid `glob::glob` here even though the upstream API would be a
// one-liner. Rationale:
//
//   `glob::glob("deep/a/b/actual/**/*")` walks from `.` and opens each
//   intermediate directory (`.`, `deep`, `deep/a`, …) to enumerate. Under
//   our WASI sandbox the preopen we register is the common-ancestor
//   directory (e.g. `./deep/a/b`), so `.` / `deep` / `deep/a` are OUTSIDE
//   the sandbox and `read_dir` on them fails. glob swallows that error
//   and returns 0 matches — silent data loss: reg.json comes back with
//   every list empty, exit code 0, HTML report says "success".
//
// `std::fs::read_dir(root)` on the other hand starts at an absolute-ish
// path that wasi-libc's `__wasilibc_find_relpath` CAN resolve to the
// preopen fd directly (verified empirically). So a direct recursive
// walker starting at `root` sidesteps the trap without needing any
// sandbox widening.
fn walk_images(root: &Path) -> BTreeSet<PathBuf> {
    let mut out = BTreeSet::new();
    // `root` itself might not exist (e.g. a brand-new actual/ dir that a
    // user forgot to populate). Classic reg-cli treats that as "no images
    // here" rather than erroring out, so we do too.
    let Ok(entries) = std::fs::read_dir(root) else {
        return out;
    };
    let mut stack: Vec<std::fs::ReadDir> = vec![entries];
    while let Some(dir) = stack.last_mut() {
        match dir.next() {
            Some(Ok(entry)) => {
                let p = entry.path();
                let Ok(ft) = entry.file_type() else { continue };
                if ft.is_dir() {
                    if let Ok(sub) = std::fs::read_dir(&p) {
                        stack.push(sub);
                    }
                } else if is_supported_extension(&p) {
                    // Strip `root` so callers get repo-relative paths like
                    // `sample.png` or `sub/sample.png`, matching what
                    // glob used to produce after `.strip_prefix(root)`.
                    if let Ok(rel) = p.strip_prefix(root) {
                        out.insert(rel.to_path_buf());
                    }
                }
            }
            Some(Err(_)) | None => {
                stack.pop();
            }
        }
    }
    out
}

#[instrument(fields(expected_dir = %expected_dir.as_ref().display(), actual_dir = %actual_dir.as_ref().display()))]
pub(crate) fn find_images(
    expected_dir: impl AsRef<Path>,
    actual_dir: impl AsRef<Path>,
) -> DetectedImages {
    let expected_dir = expected_dir.as_ref();
    let actual_dir = actual_dir.as_ref();

    let expected: BTreeSet<PathBuf> = walk_images(expected_dir);
    let actual: BTreeSet<PathBuf> = walk_images(actual_dir);

    let deleted: BTreeSet<PathBuf> = expected.difference(&actual).cloned().collect();
    let new: BTreeSet<PathBuf> = actual.difference(&expected).cloned().collect();

    info!(
        expected_count = expected.len(),
        actual_count = actual.len(),
        deleted_count = deleted.len(),
        new_count = new.len(),
        "Found images"
    );

    DetectedImages {
        expected,
        actual,
        deleted,
        new,
    }
}

fn is_passed(
    width: u32,
    height: u32,
    diff_count: u64,
    threshold_pixel: Option<u64>,
    threshold_rate: Option<f32>,
) -> bool {
    if let Some(t) = threshold_pixel {
        diff_count <= t
    } else if let Some(t) = threshold_rate {
        let pixel = width * height;
        let ratio = diff_count as f32 / pixel as f32;
        ratio <= t
    } else {
        diff_count == 0
    }
}

#[cfg(test)]
mod per_image_failure_tests {
    use super::*;
    use std::fs;

    /// Smallest possible 1×1 PNG (transparent pixel). Used for the
    /// "valid neighbour" image so we can assert that a corrupt sibling
    /// doesn't sink the whole batch.
    const TINY_PNG: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];

    fn mkdirs(root: &Path) -> (PathBuf, PathBuf, PathBuf) {
        let actual = root.join("actual");
        let expected = root.join("expected");
        let diff = root.join("diff");
        fs::create_dir_all(&actual).unwrap();
        fs::create_dir_all(&expected).unwrap();
        fs::create_dir_all(&diff).unwrap();
        (actual, expected, diff)
    }

    /// A single corrupt PNG (0 bytes) on both sides must NOT bubble up
    /// as `Err(CompareError)`. It must show up as a `failedItems` entry,
    /// while the neighbouring valid pair still passes through normally.
    #[test]
    fn corrupt_png_is_recorded_as_failed_not_propagated() {
        let tmp = tempfile::tempdir().unwrap();
        let (actual, expected, diff) = mkdirs(tmp.path());

        // Valid pair (same bytes → pass)
        fs::write(actual.join("good.png"), TINY_PNG).unwrap();
        fs::write(expected.join("good.png"), TINY_PNG).unwrap();

        // Corrupt pair: looks like a PNG (right extension, file exists,
        // non-zero so find_images doesn't drop it as a delete) but the
        // bytes are not a valid image — image_diff_rs will Err on decode.
        // Bytes must DIFFER between sides so the lib can't byte-eq fast-path
        // its way to a fake "pass".
        fs::write(actual.join("bad.png"), b"this is definitely not a png AAA").unwrap();
        fs::write(expected.join("bad.png"), b"this is definitely not a png BBB").unwrap();

        let report = run(&actual, &expected, &diff, Options::default())
            .expect("per-image decode failures must not propagate as Err");

        // good.png passed, bad.png went into failedItems.
        let passed: Vec<String> = report.passed_items.iter().map(|p| p.display().to_string()).collect();
        let failed: Vec<String> = report.failed_items.iter().map(|p| p.display().to_string()).collect();
        assert!(passed.iter().any(|s| s == "good.png"), "good.png should pass, got passed={:?}", passed);
        assert!(failed.iter().any(|s| s == "bad.png"), "bad.png should fail, got failed={:?}", failed);
    }

/// Non-image extensions (`.txt`, `.md`, etc.) are filtered out by
    /// `find_images` upstream — they should NOT show up in any of the
    /// output buckets. This locks in the "silently skip non-images"
    /// contract documented in `SUPPORTED_EXTENTIONS`.
    #[test]
    fn non_image_extensions_are_silently_skipped() {
        let tmp = tempfile::tempdir().unwrap();
        let (actual, expected, diff) = mkdirs(tmp.path());

        fs::write(actual.join("ok.png"), TINY_PNG).unwrap();
        fs::write(expected.join("ok.png"), TINY_PNG).unwrap();
        // Random non-image siblings on both sides.
        fs::write(actual.join("README.md"), b"hello").unwrap();
        fs::write(expected.join("notes.txt"), b"world").unwrap();

        let report = run(&actual, &expected, &diff, Options::default()).unwrap();

        for bucket in [
            &report.passed_items,
            &report.failed_items,
            &report.new_items,
            &report.deleted_items,
        ] {
            let names: Vec<String> = bucket.iter().map(|p| p.display().to_string()).collect();
            assert!(
                names.iter().all(|n| !n.ends_with(".md") && !n.ends_with(".txt")),
                "non-image leaked into a bucket: {:?}",
                names
            );
        }
    }
}
