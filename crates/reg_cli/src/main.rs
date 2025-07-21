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

    #[arg(long)]
    tracing: bool,
}

// Native main function with tracing support
#[cfg(all(not(all(target_os = "wasi", target_env = "p1")), feature = "jaeger"))]
#[tokio::main]
pub async fn main() {
    let result = inner_async().await;
    
    // Shutdown tracing with explicit flush
    println!("Flushing traces to Jaeger...");
    // Longer wait for HTTP OTLP exporter
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    reg_core::shutdown_tracing();
    // Additional wait after shutdown
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    println!("Tracing shutdown completed");
    
    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

// Native main function without tracing 
#[cfg(all(not(all(target_os = "wasi", target_env = "p1")), not(feature = "jaeger")))]
pub fn main() {
    let result = inner_sync();
    
    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

// WASI main function (no-op)
#[cfg(all(target_os = "wasi", target_env = "p1"))]
pub fn main() {
    // NOP
}

// Async version for tracing support
#[cfg(feature = "jaeger")]
async fn inner_async() -> Result<JsonReport, reg_core::CompareError> {
    let args = Args::parse();

    // Initialize tracing if enabled via CLI flag or environment variable
    let tracing_enabled = args.tracing 
        || std::env::var("JAEGER_ENABLED").unwrap_or_default() == "true"
        || std::env::var("RUST_TRACING").unwrap_or_default() == "true";
    
    if tracing_enabled {
        if let Err(e) = reg_core::init_tracing() {
            eprintln!("Failed to initialize tracing: {}", e);
        } else {
            println!("Jaeger tracing enabled - view traces at http://localhost:16686");
        }
    }

    create_options_and_run(args)
}

// Sync version without tracing
fn inner_sync() -> Result<JsonReport, reg_core::CompareError> {
    let args = Args::parse();
    create_options_and_run(args)
}

// Common function to create options and run
fn create_options_and_run(args: Args) -> Result<JsonReport, reg_core::CompareError> {
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

// WASM exports
#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[repr(C)]
pub struct WasmOutput {
    pub len: usize,
    pub buf: *mut u8,
}

#[cfg(all(target_os = "wasi", target_env = "p1"))]
#[no_mangle]
pub extern "C" fn wasm_main() -> *mut WasmOutput {
    let res = inner_wasi();
    if let Ok(res) = res {
        let mut s = serde_json::to_string_pretty(&res).unwrap();

        let len = s.len();
        let ptr = s.as_mut_ptr();
        std::mem::forget(s);

        let output = Box::new(WasmOutput { len, buf: ptr });
        Box::into_raw(output)
    } else {
        panic!("Failed to exec wasm main. readon {:?}", res);
    }
}

// WASI version 
#[cfg(all(target_os = "wasi", target_env = "p1"))]
fn inner_wasi() -> Result<JsonReport, reg_core::CompareError> {
    let args = Args::parse();
    create_options_and_run(args)
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
