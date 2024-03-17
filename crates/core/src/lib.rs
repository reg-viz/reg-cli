// type RegParams = {
//     actualDir: string,
//     expectedDir: string,
//     diffDir: string,
//     report?: string,
//     junitReport?: string,
//     json?: string,
//     update?: boolean,
//     extendedErrors?: boolean,
//     urlPrefix?: string,
//     matchingThreshold?: number,
//     threshold?: number, // alias to thresholdRate.
//     thresholdRate?: number,
//     thresholdPixel?: number,
//     concurrency?: number,
//     enableAntialias?: boolean,
//     enableClientAdditionalDetection?: boolean,
//   };
// fn main() {
//     // let a = include_bytes!("../../sample/actual/sample.png");
//     // let b = include_bytes!("../../sample/expected/sample.png");
//     // image_diff_rs::diff(
//     //     a,
//     //     b,
//     //     &image_diff_rs::DiffOption {
//     //         threshold: Some(0.1),
//     //         include_anti_alias: Some(true),
//     //     },
//     // )
//     // .unwrap();
//     // crate::run();
// }
//
//const aggregate = result => {
//    const passed = result.filter(r => r.passed).map(r => r.image);
//    const failed = result.filter(r => !r.passed).map(r => r.image);
//    const diffItems = failed.map(image => image.replace(/\.[^\.]+$/, '.png'));
//    return { passed, failed, diffItems };
//  };
mod report;

use image_diff_rs::DiffOption;
use rayon::prelude::*;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

static IMAGE_FILES: &str = "/**/*.{tiff,jpeg,jpg,gif,png,bmp,webp}";

#[derive(Debug)]
pub(crate) struct DetectedImages {
    pub(crate) expected: BTreeSet<PathBuf>,
    pub(crate) actual: BTreeSet<PathBuf>,
    pub(crate) deleted: BTreeSet<PathBuf>,
    pub(crate) new: BTreeSet<PathBuf>,
}

pub fn run(expected_dir: impl AsRef<Path>, actual_dir: impl AsRef<Path>) {
    let actual_dir = actual_dir.as_ref().to_owned();
    let expected_dir = expected_dir.as_ref().to_owned();
    let detected = find_images(&expected_dir, &actual_dir);

    let targets: Vec<PathBuf> = detected
        .actual
        .intersection(&detected.expected)
        .cloned()
        .collect();

    let result: Result<Vec<()>, std::io::Error> = targets
        .par_iter()
        .map(|path| {
            let img1 = std::fs::read(actual_dir.clone().join(path))?;
            let img2 = std::fs::read(expected_dir.clone().join(path))?;
            let res = image_diff_rs::diff(
                img1,
                img2,
                &DiffOption {
                    threshold: Some(0.05),
                    include_anti_alias: Some(true),
                },
            );
            std::fs::write("./test.png", res.unwrap().diff_image)?;
            Ok(())
        })
        .inspect(|r| if let Err(e) = r { /*TODO: logging */ })
        .collect();
    report::Report::create();
}

pub(crate) fn find_images(
    expected_dir: impl AsRef<Path>,
    actual_dir: impl AsRef<Path>,
) -> DetectedImages {
    let expected_dir = expected_dir.as_ref();
    let actual_dir = actual_dir.as_ref();

    let expected: BTreeSet<PathBuf> =
        globmatch::Builder::new(&(expected_dir.display().to_string() + IMAGE_FILES))
            .build(".")
            .expect("the pattern should be correct.")
            .into_iter()
            .flatten()
            .map(|p| p.strip_prefix(expected_dir).unwrap().to_path_buf())
            .collect();

    let actual: BTreeSet<PathBuf> =
        globmatch::Builder::new(&(actual_dir.display().to_string() + IMAGE_FILES))
            .build(".")
            .expect("the pattern should be correct.")
            .into_iter()
            .flatten()
            .map(|p| p.strip_prefix(actual_dir).unwrap().to_path_buf())
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
    diff_count: u32,
    threshold_pixel: Option<u32>,
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
