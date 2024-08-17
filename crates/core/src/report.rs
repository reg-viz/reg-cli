use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use bytes::Bytes;
use mustache::MapBuilder;
use serde::Serialize;

pub(crate) struct Report;

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
    // pub(crate) expected: BTreeSet<PathBuf>,
    // pub(crate) actual: BTreeSet<PathBuf>,
    pub(crate) differences: BTreeSet<PathBuf>,
    // json: string,
    pub(crate) actual_dir: &'a Path,
    pub(crate) expected_dir: &'a Path,
    pub(crate) diff_dir: &'a Path,
    // report: string,
    // junitReport: string,
    // extendedErrors: boolean,
    // urlPrefix: string,
    // enableClientAdditionalDetection: boolean,
    // fromJSON?: boolean,
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
pub(crate) struct ReportJson {
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

fn encode_file_path(file_path: &Path) -> String {
    file_path
        .display()
        .to_string()
        .split(std::path::MAIN_SEPARATOR)
        .map(|p| urlencoding::encode(p).into())
        .collect::<Vec<String>>()
        .join(std::path::MAIN_SEPARATOR_STR)
}

pub(crate) struct ReportBuffers {
    pub(crate) html: Bytes,
}

impl Report {
    pub fn create(input: ReportInput) -> ReportBuffers {
        let template = include_str!("../../../template/template.html");
        let js = include_str!("../../../report/ui/dist/report.js");
        let css = include_str!("../../../report/ui/dist/style.css");

        let json = ReportJson {
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
            actual_dir: input.actual_dir.into(),
            expected_dir: input.expected_dir.into(),
            diff_dir: input.diff_dir.into(),
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
        ReportBuffers { html: html.into() }
    }
}
