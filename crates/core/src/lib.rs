mod report;

use image_diff_rs::{DiffOption, DiffOutput};
use rayon::prelude::*;
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
pub struct Options {
    // report?: string,
    // junitReport?: string,
    // json?: string,
    // update?: boolean,
    // extendedErrors?: boolean,
    // urlPrefix?: string,
    // matchingThreshold?: number,
    threshold_rate: Option<f32>,
    threshold_pixel: Option<u64>,
    // concurrency?: number,
    enable_antialias: Option<bool>,
    // enableClientAdditionalDetection?: boolean,
}

impl Default for Options {
    fn default() -> Self {
        Self {
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
    let actual_dir = actual_dir.as_ref().to_owned();
    let expected_dir = expected_dir.as_ref().to_owned();
    let diff_dir = diff_dir.as_ref().to_owned();

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

    let mut differences = vec![];
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
            diff_image.set_extension("webp");
            differences.push(diff_image);
        }
    }

    report::Report::create(report::ReportInput {
        passed,
        failed,
        new: detected.new,
        differences,
        actual_dir,
        expected_dir,
        diff_dir,
    });
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
            is_supported_extension(&p)
                .then_some(p.strip_prefix(expected_dir).unwrap().to_path_buf())
        })
        .collect();

    let actual: BTreeSet<PathBuf> = glob::glob(&(actual_dir.display().to_string() + "/**/*"))
        .expect("the pattern should be correct.")
        .flatten()
        .filter_map(|p| {
            is_supported_extension(&p).then_some(p.strip_prefix(actual_dir).unwrap().to_path_buf())
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
