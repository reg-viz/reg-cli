use clap::{Parser, ValueEnum};
use reg_core::{run, run_from_json, DiffImageFormat, JsonReport, Options, Url};
use std::path::{Path, PathBuf};
use tracing::info_span;

#[derive(ValueEnum, Debug, Clone, Copy, PartialEq, Eq)]
enum DiffFormatArg {
    Webp,
    Png,
}

impl From<DiffFormatArg> for DiffImageFormat {
    fn from(f: DiffFormatArg) -> Self {
        match f {
            DiffFormatArg::Webp => DiffImageFormat::Webp,
            DiffFormatArg::Png => DiffImageFormat::Png,
        }
    }
}

#[derive(ValueEnum, Debug, Clone, Copy, PartialEq, Eq)]
enum AdditionalDetection {
    None,
    Client,
}

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[clap(index = 1)]
    actual_dir: Option<PathBuf>,

    #[clap(index = 2)]
    expected_dir: Option<PathBuf>,

    #[clap(index = 3)]
    diff_dir: Option<PathBuf>,

    #[arg(short = 'R', long)]
    report: Option<PathBuf>,

    #[arg(short = 'J', long)]
    json: Option<PathBuf>,

    /// Path to write the JUnit XML test report.
    #[arg(long = "junit")]
    junit: Option<PathBuf>,

    /// Escalate added/deleted images to failures in the JUnit XML (and at
    /// the CLI exit-code layer on the JS wrapper). Mirrors classic
    /// reg-cli's `-E, --extendedErrors`.
    #[arg(short = 'E', long = "extendedErrors", default_missing_value = "true", num_args = 0..=1)]
    extended_errors: Option<bool>,

    #[arg(short = 'M', long = "matchingThreshold")]
    matching_threshold: Option<f32>,

    #[arg(short = 'T', long = "thresholdRate")]
    threshold_rate: Option<f32>,

    #[arg(short = 'S', long = "thresholdPixel")]
    threshold_pixel: Option<u64>,

    #[arg(short = 'P', long = "urlPrefix")]
    url_prefix: Option<Url>,

    #[arg(short = 'C', long)]
    concurrency: Option<usize>,

    #[arg(short = 'A', long = "enableAntialias", default_missing_value = "true", num_args = 0..=1)]
    enable_antialias: Option<bool>,

    /// Output format for diff images. `webp` (default) matches the current
    /// Rust/Wasm behaviour. `png` matches the classic JS implementation.
    #[arg(long = "diffFormat", value_enum)]
    diff_format: Option<DiffFormatArg>,

    /// Re-render HTML report from an existing reg.json (no image comparison).
    /// Mirrors classic reg-cli's `-F, --from`.
    #[arg(short = 'F', long = "from")]
    from: Option<PathBuf>,

    /// Enable the HTML report's client-side additional detection pass.
    /// Mirrors classic reg-cli's `-X, --additionalDetection`.
    #[arg(short = 'X', long = "additionalDetection", value_enum)]
    additional_detection: Option<AdditionalDetection>,
}

#[cfg(not(all(target_os = "wasi", target_env = "p1")))]
pub fn main() {
    // Initialize tracing for non-WASI builds
    reg_core::init_tracing();
    let _ = inner();
}

#[cfg(all(target_os = "wasi", target_env = "p1"))]
pub fn main() {
    // NOP
}

fn inner() -> Result<JsonReport, reg_core::CompareError> {
    let _root_span = info_span!("reg_cli_main").entered();

    let args = Args::parse();

    let options = Options {
        report: args.report.as_deref().map(Path::new),
        junit_report: args.junit.as_deref().map(Path::new),
        json: args.json.as_deref().map(Path::new),
        extended_errors: args.extended_errors,
        matching_threshold: args.matching_threshold,
        threshold_rate: args.threshold_rate,
        threshold_pixel: args.threshold_pixel,
        concurrency: args.concurrency,
        enable_antialias: args.enable_antialias,
        url_prefix: args.url_prefix,
        diff_image_format: args.diff_format.map(DiffImageFormat::from),
        enable_client_additional_detection: args
            .additional_detection
            .map(|v| matches!(v, AdditionalDetection::Client)),
    };

    // `-F / --from` short-circuits the diff pipeline and re-renders HTML from
    // an existing reg.json. Positional dirs are not required in this mode.
    if let Some(from) = args.from.as_deref() {
        return run_from_json(from, options);
    }

    let actual_dir = args.actual_dir.ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "actual_dir is required (or pass --from to regenerate from reg.json)",
        )
    })?;
    let expected_dir = args.expected_dir.ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "expected_dir is required",
        )
    })?;
    let diff_dir = args.diff_dir.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "diff_dir is required")
    })?;

    run(actual_dir, expected_dir, diff_dir, options)
}

#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[repr(C)]
pub struct WasmOutput {
    pub len: usize,
    pub buf: *mut u8,
}

#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[no_mangle]
pub extern "C" fn init_tracing() {
    reg_core::init_tracing();
}

/// Set JS trace context for context propagation
/// trace_id_ptr: pointer to trace_id string (null-terminated or with length)
/// trace_id_len: length of trace_id string
/// span_id_ptr: pointer to parent span_id string
/// span_id_len: length of span_id string
#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[no_mangle]
pub unsafe extern "C" fn set_trace_context(
    trace_id_ptr: *const u8,
    trace_id_len: usize,
    span_id_ptr: *const u8,
    span_id_len: usize,
) {
    let trace_id = if trace_id_ptr.is_null() || trace_id_len == 0 {
        None
    } else {
        let slice = std::slice::from_raw_parts(trace_id_ptr, trace_id_len);
        std::str::from_utf8(slice).ok()
    };
    
    let span_id = if span_id_ptr.is_null() || span_id_len == 0 {
        None
    } else {
        let slice = std::slice::from_raw_parts(span_id_ptr, span_id_len);
        std::str::from_utf8(slice).ok()
    };
    
    reg_core::set_js_trace_context(trace_id, span_id);
}

#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[no_mangle]
pub extern "C" fn wasm_main() -> *mut WasmOutput {
    let res = inner();
    if let Ok(res) = res {
        let mut s = serde_json::to_string_pretty(&res).unwrap();

        let len = s.len();
        let ptr = s.as_mut_ptr();
        std::mem::forget(s);

        let output = Box::new(WasmOutput { len, buf: ptr });
        Box::into_raw(output)
    } else {
        eprintln!("Failed to exec wasm main. Error details: {:?}", res);
        panic!("Failed to exec wasm main. reason: {:?}", res);
    }
}

/// Get collected trace data as JSON string
/// Returns a pointer to WasmOutput containing JSON trace data
#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[no_mangle]
pub extern "C" fn get_trace_data() -> *mut WasmOutput {
    let mut trace_json = reg_core::get_trace_data_json();
    
    let len = trace_json.len();
    let ptr = trace_json.as_mut_ptr();
    std::mem::forget(trace_json);
    
    let output = Box::new(WasmOutput { len, buf: ptr });
    Box::into_raw(output)
}

/// Clear all collected trace data
#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[no_mangle]
pub extern "C" fn clear_trace_data() {
    reg_core::clear_trace_data();
}

#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[no_mangle]
pub extern "C" fn free_wasm_output(ptr: *mut WasmOutput) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        let output = Box::from_raw(ptr);
        Vec::from_raw_parts(output.buf, output.len, output.len);
    }
}
