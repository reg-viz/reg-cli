mod dir;
mod report;

use image_diff_rs::{DiffOption, DiffOutput, ImageDiffError};
use path_clean::PathClean;
use rayon::{prelude::*, ThreadPoolBuilder};
use report::create_reports;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use thiserror::Error;

// Jaeger tracing imports
#[cfg(feature = "jaeger")]
use tracing::{info, instrument, span, Level};
#[cfg(feature = "jaeger")]
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub use report::JsonReport;
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

static DEFAULT_JSON_PATH: &'static str = "./reg.json";
static DEFAULT_REPORT_PATH: &'static str = "./report.html";

/// Initialize Jaeger tracing if enabled
#[cfg(feature = "jaeger")]
pub fn init_tracing() -> Result<(), Box<dyn std::error::Error>> {
    use opentelemetry_sdk::trace as sdktrace;
    use opentelemetry_otlp::WithExportConfig;
    
    let jaeger_endpoint = std::env::var("JAEGER_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4318/v1/traces".to_string());
    
    // Create OTLP HTTP exporter
    let exporter = opentelemetry_otlp::new_exporter()
        .http()
        .with_endpoint(jaeger_endpoint);
    
    // Create tracer with resource information
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(exporter)
        .with_trace_config(
            sdktrace::config()
                .with_resource(opentelemetry_sdk::Resource::new(vec![
                    opentelemetry::KeyValue::new("service.name", "reg-cli-rust"),
                    opentelemetry::KeyValue::new("service.version", env!("CARGO_PKG_VERSION")),
                ]))
        )
        .install_batch(opentelemetry_sdk::runtime::Tokio)?;

    // Create tracing layer
    let telemetry_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    // Initialize subscriber with both console and jaeger
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .compact()
        )
        .with(telemetry_layer)
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Jaeger tracing initialized for reg-cli-rust");
    Ok(())
}

#[cfg(not(feature = "jaeger"))]
pub fn init_tracing() -> Result<(), Box<dyn std::error::Error>> {
    // No-op when jaeger feature is disabled
    Ok(())
}

/// Shutdown tracing
#[cfg(feature = "jaeger")]
pub fn shutdown_tracing() {
    opentelemetry::global::shutdown_tracer_provider();
}

#[cfg(not(feature = "jaeger"))]
pub fn shutdown_tracing() {
    // No-op when jaeger feature is disabled
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
    // junitReport?: string,
    pub json: Option<&'a Path>,
    // update?: boolean,
    // extendedErrors?: boolean,
    pub url_prefix: Option<url::Url>,
    pub matching_threshold: Option<f32>,
    pub threshold_rate: Option<f32>,
    pub threshold_pixel: Option<u64>,
    pub concurrency: Option<usize>,
    pub enable_antialias: Option<bool>,
    // enableClientAdditionalDetection?: boolean,
}

impl<'a> Default for Options<'a> {
    fn default() -> Self {
        Self {
            report: None,
            json: Some(Path::new(DEFAULT_JSON_PATH)),
            url_prefix: None,
            matching_threshold: Some(0.0),
            threshold_rate: None,
            threshold_pixel: None,
            concurrency: Some(4),
            enable_antialias: None,
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
#[cfg_attr(feature = "jaeger", instrument(name = "reg-cli-rust-main", skip_all, fields(
    actual_dir = %actual_dir.as_ref().display(),
    expected_dir = %expected_dir.as_ref().display(),
    diff_dir = %diff_dir.as_ref().display(),
    concurrency = options.concurrency.unwrap_or(4)
)))]
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

    #[cfg(feature = "jaeger")]
    info!("Starting reg-cli-rust comparison");

    let detected = find_images(&expected_dir, &actual_dir);
    
    #[cfg(feature = "jaeger")]
    info!(
        expected_images = detected.expected.len(),
        actual_images = detected.actual.len(),
        new_images = detected.new.len(),
        deleted_images = detected.deleted.len(),
        "Image discovery completed"
    );

    let targets: Vec<PathBuf> = detected
        .actual
        .intersection(&detected.expected)
        .cloned()
        .collect();

    #[cfg(feature = "jaeger")]
    info!(target_images = targets.len(), "Images to compare");

    let thread_count = options.concurrency.unwrap_or_else(|| 4);
    
    // ThreadPool creation with tracing
    let pool = {
        #[cfg(feature = "jaeger")]
        let _span = span!(Level::INFO, "threadpool-creation", threads = thread_count).entered();
        
        #[cfg(feature = "jaeger")]
        info!("Creating ThreadPool with {} threads", thread_count);
        
        ThreadPoolBuilder::new()
            .num_threads(thread_count)
            .build()
            .unwrap()
    };

    // Image comparison with tracing
    let result = {
        #[cfg(feature = "jaeger")]
        let _span = span!(Level::INFO, "image-comparison-batch", 
                         image_count = targets.len(), 
                         thread_count = thread_count).entered();

        pool.install(|| {
            targets
                .par_iter() // 並列処理に戻す
                .map(|path| {
                    // Create a properly nested span for each parallel task
                    #[cfg(feature = "jaeger")]
                    let span = span!(Level::INFO, "parallel-image-diff", 
                                   image = %path.display());
                    #[cfg(feature = "jaeger")]
                    let _entered = span.enter();

                    #[cfg(feature = "jaeger")]
                    info!("Processing image: {}", path.display());
                    
                    // File reading spans
                    let img1 = {
                        #[cfg(feature = "jaeger")]
                        let _span = span!(Level::INFO, "read-actual-file", 
                                         image = %path.display()).entered();
                        std::fs::read(actual_dir.join(path))?
                    };
                    
                    let img2 = {
                        #[cfg(feature = "jaeger")]
                        let _span = span!(Level::INFO, "read-expected-file", 
                                         image = %path.display()).entered();
                        std::fs::read(expected_dir.join(path))?
                    };
                    
                    #[cfg(feature = "jaeger")]
                    info!(
                        actual_size = img1.len(),
                        expected_size = img2.len(),
                        "Image files read"
                    );
                    
                    // Image diff calculation span
                    let res = {
                        #[cfg(feature = "jaeger")]
                        let _span = span!(Level::INFO, "diff-calculation", 
                                         image = %path.display(),
                                         actual_size = img1.len(),
                                         expected_size = img2.len()).entered();
                        
                        image_diff_rs::diff(
                            img1,
                            img2,
                            &DiffOption {
                                threshold: options.matching_threshold,
                                include_anti_alias: Some(!options.enable_antialias.unwrap_or_default()),
                            },
                        )?
                    };
                    
                    #[cfg(feature = "jaeger")]
                    match &res {
                        DiffOutput::Eq => info!("Image comparison: PASSED"),
                        DiffOutput::NotEq { diff_count, .. } => 
                            info!(diff_count = diff_count, "Image comparison: FAILED"),
                    }
                    
                    Ok((path.clone(), res))
                })
                .inspect(|r| {
                    if let Err(e) = r {
                        #[cfg(feature = "jaeger")]
                        tracing::error!(error = %e, "Image comparison failed");
                        dbg!(&e);
                    }
                })
        })
        .collect::<Result<Vec<(PathBuf, DiffOutput)>, CompareError>>()?
    };

    #[cfg(feature = "jaeger")]
    info!("Image comparison completed, processing results");

    // Result processing with tracing
    let (differences, passed, failed) = {
        #[cfg(feature = "jaeger")]
        let _span = span!(Level::INFO, "result-processing").entered();

        let mut differences = BTreeSet::new();
        let mut passed = BTreeSet::new();
        let mut failed = BTreeSet::new();

        for (image_name, item) in result.iter() {
            match item {
                DiffOutput::Eq => {
                    #[cfg(feature = "jaeger")]
                    let _span = span!(Level::INFO, "process-passed-image", 
                                     image = %image_name.display()).entered();
                    passed.insert(image_name.clone());
                }
                DiffOutput::NotEq {
                    diff_count,
                    diff_image,
                    width,
                    height,
                } => {
                    #[cfg(feature = "jaeger")]
                    let _span = span!(Level::INFO, "process-failed-image", 
                                     image = %image_name.display(),
                                     diff_count = *diff_count,
                                     width = *width,
                                     height = *height).entered();
                    
                    if is_passed(
                        width.clone(),
                        height.clone(),
                        diff_count.clone() as u64,
                        options.threshold_pixel,
                        options.threshold_rate,
                    ) {
                        #[cfg(feature = "jaeger")]
                        info!("Image passed threshold check");
                        passed.insert(image_name.clone());
                    } else {
                        let mut diff_image_name = image_name.clone();
                        failed.insert(image_name.clone());
                        differences.insert(diff_image_name.clone());
                        diff_image_name.set_extension("webp");
                        
                        #[cfg(feature = "jaeger")]
                        info!(image = %image_name.display(), "Writing diff image");
                        
                        // Diff image writing span
                        {
                            #[cfg(feature = "jaeger")]
                            let _span = span!(Level::INFO, "write-diff-image", 
                                             image = %image_name.display(),
                                             diff_size = diff_image.len()).entered();
                            std::fs::write(diff_dir.join(&diff_image_name), diff_image)?;
                        }
                    }
                }
            }
        }

        #[cfg(feature = "jaeger")]
        info!(
            passed_count = passed.len(),
            failed_count = failed.len(),
            differences_count = differences.len(),
            "Result processing completed"
        );

        (differences, passed, failed)
    };

    // Report creation with tracing
    let report = {
        #[cfg(feature = "jaeger")]
        let _span = span!(Level::INFO, "report-creation").entered();

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
        })
    };

    if let (Some(html), Some(report)) = (report.html, options.report) {
        #[cfg(feature = "jaeger")]
        let _span = span!(Level::INFO, "html-report-write").entered();
        
        std::fs::write(report, html)?;
    };

    #[cfg(feature = "jaeger")]
    info!("reg-cli-rust comparison completed successfully");

    Ok(report.json)
}

#[cfg_attr(feature = "jaeger", instrument(name = "find-images", skip_all, fields(
    expected_dir = %expected_dir.as_ref().display(),
    actual_dir = %actual_dir.as_ref().display()
)))]
pub(crate) fn find_images(
    expected_dir: impl AsRef<Path>,
    actual_dir: impl AsRef<Path>,
) -> DetectedImages {
    let expected_dir = expected_dir.as_ref();
    let actual_dir = actual_dir.as_ref();

    #[cfg(feature = "jaeger")]
    info!("Starting image discovery");

    let expected: BTreeSet<PathBuf> = {
        #[cfg(feature = "jaeger")]
        let _span = span!(Level::INFO, "glob-expected-images").entered();
        
        let pattern = expected_dir.display().to_string() + "/**/*";
        #[cfg(feature = "jaeger")]
        info!(pattern = %pattern, "Scanning expected directory");
        
        let result: BTreeSet<PathBuf> = glob::glob(&pattern)
            .expect("the pattern should be correct.")
            .flatten()
            .filter_map(|p| {
                is_supported_extension(&p).then_some(
                    p.clean()
                        .strip_prefix(expected_dir.clean())
                        .unwrap()
                        .to_path_buf(),
                )
            })
            .collect();
            
        #[cfg(feature = "jaeger")]
        let count = result.len();
        #[cfg(feature = "jaeger")]
        info!(count = count, "Expected images found");
        
        result
    };

    let actual: BTreeSet<PathBuf> = {
        #[cfg(feature = "jaeger")]
        let _span = span!(Level::INFO, "glob-actual-images").entered();
        
        let pattern = actual_dir.display().to_string() + "/**/*";
        #[cfg(feature = "jaeger")]
        info!(pattern = %pattern, "Scanning actual directory");
        
        let result: BTreeSet<PathBuf> = glob::glob(&pattern)
            .expect("the pattern should be correct.")
            .flatten()
            .filter_map(|p| {
                is_supported_extension(&p).then_some(
                    p.clean()
                        .strip_prefix(actual_dir.clean())
                        .unwrap()
                        .to_path_buf(),
                )
            })
            .collect();
            
        #[cfg(feature = "jaeger")]
        let count = result.len();
        #[cfg(feature = "jaeger")]
        info!(count = count, "Actual images found");
        
        result
    };

    let deleted: BTreeSet<PathBuf> = expected.difference(&actual).cloned().collect();
    let new: BTreeSet<PathBuf> = actual.difference(&expected).cloned().collect();

    #[cfg(feature = "jaeger")]
    info!(
        expected_total = expected.len(),
        actual_total = actual.len(), 
        deleted_count = deleted.len(),
        new_count = new.len(),
        "Image discovery completed"
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
