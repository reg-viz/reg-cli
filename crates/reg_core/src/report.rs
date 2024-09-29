use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use bytes::Bytes;
use mustache::MapBuilder;
use serde::Serialize;

use crate::dir::resolve_dir;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ReportStatus {
    Success,
    Danger,
}

pub(crate) struct ReportInput<'a> {
    pub(crate) passed: BTreeSet<PathBuf>,
    pub(crate) failed: BTreeSet<PathBuf>,
    pub(crate) new: BTreeSet<PathBuf>,
    pub(crate) deleted: BTreeSet<PathBuf>,
    pub(crate) expected: BTreeSet<PathBuf>,
    pub(crate) actual: BTreeSet<PathBuf>,
    pub(crate) differences: BTreeSet<PathBuf>,
    pub(crate) json: &'a Path,
    pub(crate) actual_dir: &'a Path,
    pub(crate) expected_dir: &'a Path,
    pub(crate) diff_dir: &'a Path,
    pub(crate) report: Option<&'a Path>,
    // junitReport: string,
    // extendedErrors: boolean,
    pub(crate) url_prefix: Option<url::Url>,
    // enableClientAdditionalDetection: boolean,
    pub(crate) from_json: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportItem {
    pub(crate) raw: String,
    pub(crate) encoded: String,
}

impl From<PathBuf> for ReportItem {
    fn from(item: PathBuf) -> Self {
        let encoded = encode_file_path(&item);
        ReportItem {
            raw: item.display().to_string(),
            encoded,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct XimgdiffConfig {
    pub(crate) enabled: bool,
    pub(crate) worker_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportJsonInput {
    r#type: ReportStatus,
    has_new: bool,
    new_items: Vec<ReportItem>,
    has_deleted: bool,
    deleted_items: Vec<ReportItem>,
    has_passed: bool,
    passed_items: Vec<ReportItem>,
    has_failed: bool,
    failed_items: Vec<ReportItem>,
    actual_dir: PathBuf,
    expected_dir: PathBuf,
    diff_dir: PathBuf,
    diff_image_extention: &'static str,
    ximgdiff_config: XimgdiffConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonReport {
    pub failed_items: BTreeSet<PathBuf>,
    pub new_items: BTreeSet<PathBuf>,
    pub deleted_items: BTreeSet<PathBuf>,
    pub passed_items: BTreeSet<PathBuf>,
    pub expected_items: BTreeSet<PathBuf>,
    pub actual_items: BTreeSet<PathBuf>,
    pub diff_items: BTreeSet<PathBuf>,
    pub actual_dir: String,
    pub expected_dir: String,
    pub diff_dir: String,
}

fn encode_file_path(file_path: &Path) -> String {
    file_path
        .display()
        .to_string()
        .split(std::path::MAIN_SEPARATOR)
        .map(|p| urlencoding::encode(p).into())
        .collect::<Vec<String>>()
        .join(std::path::MAIN_SEPARATOR_STR)
}

pub(crate) struct Reports {
    pub(crate) json: JsonReport,
    pub(crate) html: Option<Bytes>,
}

// TODO: please validate input on cli input.
pub fn create_dir_for_json_report<'a>(
    json: &'a Path,
    dir: &'a Path,
    url: Option<url::Url>,
) -> String {
    if let Some(url) = url {
        url.join(&resolve_dir(json, dir).to_string_lossy())
            .expect("TODO:")
            .to_string()
    } else {
        resolve_dir(json, dir).to_string_lossy().to_string()
    }
}

pub fn create_reports(input: ReportInput) -> Reports {
    let json_report = JsonReport {
        failed_items: input.failed.clone(),
        new_items: input.new.clone(),
        deleted_items: input.deleted.clone(),
        passed_items: input.passed.clone(),
        expected_items: input.expected.clone(),
        actual_items: input.actual.clone(),
        diff_items: input.differences.clone(),
        actual_dir: create_dir_for_json_report(
            input.json,
            input.actual_dir,
            input.url_prefix.clone(),
        ),
        expected_dir: create_dir_for_json_report(
            input.json,
            input.expected_dir,
            input.url_prefix.clone(),
        ),
        diff_dir: create_dir_for_json_report(input.json, input.diff_dir, input.url_prefix.clone()),
    };

    let html_report = if let Some(report) = input.report {
        let template = include_str!("../../../template/template.html");
        let js = include_str!("../../../report/ui/dist/report.js");
        let css = include_str!("../../../report/ui/dist/style.css");

        let json = ReportJsonInput {
            r#type: if input.failed.is_empty() {
                ReportStatus::Success
            } else {
                ReportStatus::Danger
            },
            has_new: !input.new.is_empty(),
            new_items: input.new.into_iter().map(ReportItem::from).collect(),
            has_deleted: !input.deleted.is_empty(),
            deleted_items: input.deleted.into_iter().map(ReportItem::from).collect(),
            has_passed: !input.passed.is_empty(),
            passed_items: input.passed.into_iter().map(ReportItem::from).collect(),
            has_failed: !input.differences.is_empty(),
            failed_items: input
                .differences
                .into_iter()
                .map(ReportItem::from)
                .collect(),
            actual_dir: if input.from_json {
                input.actual_dir.into()
            } else {
                resolve_dir(report, input.actual_dir).into()
            },
            expected_dir: if input.from_json {
                input.expected_dir.into()
            } else {
                resolve_dir(report, input.expected_dir).into()
            },
            diff_dir: if input.from_json {
                input.diff_dir.into()
            } else {
                resolve_dir(report, input.diff_dir).into()
            },
            diff_image_extention: "webp",
            ximgdiff_config: XimgdiffConfig {
                enabled: false,
                worker_url: "TODO:".to_string(),
            },
        };

        // TODO: add favivon data
        //     faviconData: loadFaviconAsDataURL(faviconType),
        let data = MapBuilder::new()
            .insert_str("js", js)
            .insert_str("css", css)
            .insert_str(
                "report",
                serde_json::to_string(&json).expect("should convert."),
            )
            .build();
        let template = mustache::compile_str(template).expect("should compile template.");
        let mut html = vec![];
        template
            .render_data(&mut html, &data)
            .expect("should render report.");
        Some(html.into())
    } else {
        None
    };

    Reports {
        json: json_report,
        html: html_report,
    }
}
