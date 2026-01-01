use clap::Parser;
use reg_core::{run, JsonReport, Options, Url};
use std::path::{Path, PathBuf};
use tracing::info_span;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[clap(index = 1)]
    actual_dir: PathBuf,

    #[clap(index = 2)]
    expected_dir: PathBuf,

    #[clap(index = 3)]
    diff_dir: PathBuf,

    #[arg(long)]
    report: Option<PathBuf>,

    #[arg(long)]
    json: Option<PathBuf>,

    #[arg(long = "matchingThreshold")]
    matching_threshold: Option<f32>,

    #[arg(long = "thresholdRate")]
    threshold_rate: Option<f32>,

    #[arg(long = "thresholdPixel")]
    threshold_pixel: Option<u64>,

    #[arg(long = "urlPrefix")]
    url_prefix: Option<Url>,

    #[arg(long)]
    concurrency: Option<usize>,

    #[arg(long = "enableAntialias")]
    enable_antialias: Option<bool>,
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
        json: args.json.as_deref().map(Path::new),
        matching_threshold: args.matching_threshold,
        threshold_rate: args.threshold_rate,
        threshold_pixel: args.threshold_pixel,
        concurrency: args.concurrency,
        enable_antialias: args.enable_antialias,
        url_prefix: args.url_prefix,
    };

    run(args.actual_dir, args.expected_dir, args.diff_dir, options)
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
