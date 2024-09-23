use clap::Parser;
use reg_core::{run, Options};
use std::path::{Path, PathBuf};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    actual_dir: PathBuf,

    #[arg(long)]
    expected_dir: PathBuf,

    #[arg(long)]
    diff_dir: PathBuf,

    #[arg(long)]
    report: Option<PathBuf>,

    #[arg(long)]
    matching_threshold: Option<f32>,

    #[arg(long)]
    threshold_rate: Option<f32>,

    #[arg(long)]
    threshold_pixel: Option<u64>,

    #[arg(long)]
    concurrency: Option<usize>,

    #[arg(long)]
    enable_antialias: Option<bool>,
}

pub fn main() {
    let _ = inner();
}

fn inner() -> Result<(), reg_core::CompareError> {
    let args = Args::parse();

    let options = Options {
        report: args.report.as_deref().map(Path::new),
        matching_threshold: args.matching_threshold,
        threshold_rate: args.threshold_rate,
        threshold_pixel: args.threshold_pixel,
        concurrency: args.concurrency,
        enable_antialias: args.enable_antialias,
    };

    run(args.actual_dir, args.expected_dir, args.diff_dir, options)
}

#[cfg(target = "wasm32-wasip1-threads")]
#[repr(C)]
pub struct WasmOutput {
    pub len: usize,
    pub buf: *mut u8,
}

#[cfg(target = "wasm32-wasip1-threads")]
#[no_mangle]
pub extern "C" fn wasm_main() -> *mut WasmOutput {
    let json = "{}";

    let mut string = json.to_string().into_bytes();
    let string_len = string.len();
    let string_ptr = string.as_mut_ptr();
    std::mem::forget(string);

    let output = Box::new(WasmOutput {
        len: string_len,
        buf: string_ptr,
    });
    Box::into_raw(output)
}

#[cfg(target = "wasm32-wasip1-threads")]
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
