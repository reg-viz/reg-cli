use clap::Parser;
use reg_core::{run, JsonReport, Options, Url};
use std::path::{Path, PathBuf};

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

    #[clap(value_name = "matchingThreshold")]
    matching_threshold: Option<f32>,

    #[clap(value_name = "thresholdRate")]
    threshold_rate: Option<f32>,

    #[clap(value_name = "thresholdPixel")]
    threshold_pixel: Option<u64>,

    #[clap(value_name = "urlPrefix")]
    url_prefix: Option<Url>,

    #[arg(long)]
    concurrency: Option<usize>,

    #[clap(value_name = "enableAntialias")]
    enable_antialias: Option<bool>,
}

#[cfg(not(all(target_os = "wasi", target_env = "p1")))]
pub fn main() {
    let _ = inner();
}

#[cfg(all(target_os = "wasi", target_env = "p1"))]
pub fn main() {
    // NOP
}

fn inner() -> Result<JsonReport, reg_core::CompareError> {
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
pub extern "C" fn wasm_main() -> *mut WasmOutput {
    let res = inner().unwrap();
    let mut s = serde_json::to_string_pretty(&res).unwrap();

    let len = s.len();
    let ptr = s.as_mut_ptr();
    std::mem::forget(s);

    let output = Box::new(WasmOutput { len, buf: ptr });
    Box::into_raw(output)
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