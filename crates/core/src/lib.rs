mod dir;
mod report;

use dir::resolve_dir;
use image_diff_rs::{DiffOption, DiffOutput};
use path_clean::PathClean;
use rayon::prelude::*;
use report::Report;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

static SUPPORTED_EXTENTIONS: [&str; 7] = ["tiff", "jpeg", "jpg", "gif", "png", "bmp", "webp"];

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

#[derive(Debug)]
pub struct Options<'a> {
    pub report: Option<&'a Path>,
    // junitReport?: string,
    // json?: string,
    // update?: boolean,
    // extendedErrors?: boolean,
    // urlPrefix?: string,
    // matchingThreshold?: number,
    pub threshold_rate: Option<f32>,
    pub threshold_pixel: Option<u64>,
    // concurrency?: number,
    pub enable_antialias: Option<bool>,
    // enableClientAdditionalDetection?: boolean,
}

impl<'a> Default for Options<'a> {
    fn default() -> Self {
        Self {
            report: None,
            threshold_rate: None,
            threshold_pixel: None,
            enable_antialias: None,
        }
    }
}

pub fn run(
    expected_dir: impl AsRef<Path>,
    actual_dir: impl AsRef<Path>,
    diff_dir: impl AsRef<Path>,
    options: Options,
) {
    let actual_dir = actual_dir.as_ref();
    let expected_dir = expected_dir.as_ref();
    let diff_dir = diff_dir.as_ref();

    let detected = find_images(&expected_dir, &actual_dir);

    let targets: Vec<PathBuf> = detected
        .actual
        .intersection(&detected.expected)
        .cloned()
        .collect();

    let result: Result<Vec<(PathBuf, DiffOutput)>, std::io::Error> = targets
        .par_iter()
        .map(|path| {
            let img1 = std::fs::read(actual_dir.clone().join(path))?;
            let img2 = std::fs::read(expected_dir.clone().join(path))?;
            let res = image_diff_rs::diff(
                img1,
                img2,
                &DiffOption {
                    threshold: Some(0.05),
                    include_anti_alias: Some(!options.enable_antialias.unwrap_or_default()),
                },
            );
            // std::fs::write("./test.png", res.unwrap().diff_image)?;
            let res = res.expect("TODO:");
            Ok((path.clone(), res))
        })
        .inspect(|r| if let Err(e) = r { /*TODO: logging */ })
        .collect();

    let result = result.expect("TODO:");

    let mut differences = BTreeSet::new();
    let mut passed = BTreeSet::new();
    let mut failed = BTreeSet::new();

    for (image_name, item) in result.iter() {
        if is_passed(
            item.width,
            item.height,
            item.diff_count as u64,
            options.threshold_pixel,
            options.threshold_rate,
        ) {
            passed.insert(image_name.clone());
        } else {
            let mut diff_image = image_name.clone();
            failed.insert(image_name.clone());
            differences.insert(diff_image.clone());
            // TODO:
            diff_image.set_extension("webp");
            std::fs::write(diff_dir.join(&diff_image), item.diff_image.clone()).expect("TODO:");
        }
    }

    let report = Report::create(report::ReportInput {
        passed,
        failed,
        new: detected.new,
        deleted: detected.deleted,
        // actual: detected.actual,
        // expected: detected.expected,
        report: options.report,
        differences,
        actual_dir,
        expected_dir,
        diff_dir,
        from_json: false,
    });

    if let Some(html) = report.html {
        std::fs::write("./report.html", html).expect("TODO:");
    }
}

pub(crate) fn find_images(
    expected_dir: impl AsRef<Path>,
    actual_dir: impl AsRef<Path>,
) -> DetectedImages {
    let expected_dir = expected_dir.as_ref();
    let actual_dir = actual_dir.as_ref();

    let expected: BTreeSet<PathBuf> = glob::glob(&(expected_dir.display().to_string() + "/**/*"))
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

    let actual: BTreeSet<PathBuf> = glob::glob(&(actual_dir.display().to_string() + "/**/*"))
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

    let deleted = expected.difference(&actual).cloned().collect();
    let new = actual.difference(&expected).cloned().collect();

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
