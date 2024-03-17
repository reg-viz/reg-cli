use mustache::MapBuilder;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Serialize;

pub(crate) struct Report;

pub(crate) enum ReportStatus {
    Success,
    Fail,
}

pub(crate) struct ReportInput<'a> {
    // passed: &'a [&'a str],
    // failed_items: [&'a str],
    // new_items: [&'a str],
    // deleted_items: [&'a str],
    // expected_items: [&'a str],
    // actual_items: [&'a str],
    differences: [&'a str],
    // json: string,
    // actualDir: string,
    // expectedDir: string,
    // diffDir: string,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct XimgdiffConfig {
    pub(crate) enabled: bool,
    pub(crate) worker_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportJson {
    r#type: String, // 'success' : 'danger',
    has_new: bool,
    new_items: Vec<ReportItem>,
    has_deleted: bool,
    deleted_items: Vec<ReportItem>,
    has_passed: bool,
    passed_items: Vec<ReportItem>,
    has_failed: bool,
    failed_items: Vec<ReportItem>,
    actual_dir: String,
    expected_dir: String,
    diff_dir: String,
    ximgdiff_config: XimgdiffConfig,
}

fn encode_file_path(file_path: &str) -> String {
    file_path
        .split(std::path::MAIN_SEPARATOR)
        .map(|p| utf8_percent_encode(p, NON_ALPHANUMERIC).to_string())
        .collect::<Vec<String>>()
        .join(&std::path::MAIN_SEPARATOR.to_string())
}

impl Report {
    pub fn create() {
        let template = include_str!("../../../template/template.html");
        let js = include_str!("../../../report/ui/dist/report.js");
        // const view = {
        //     js,
        //     report: JSON.stringify(json),
        //     faviconData: loadFaviconAsDataURL(faviconType),
        //   };
        let json = ReportJson {
            r#type: "success".to_string(),
            has_new: false,
            new_items: vec![],
            has_deleted: false,
            deleted_items: vec![],
            has_passed: false,
            passed_items: vec![],
            has_failed: true,
            failed_items: vec![],
            actual_dir: "".to_string(),
            expected_dir: "".to_string(),
            diff_dir: "".to_string(),
            ximgdiff_config: XimgdiffConfig {
                enabled: false,
                worker_url: "".to_string(),
            },
        };
        let data = MapBuilder::new()
            .insert_str("js", js)
            .insert_str(
                "report",
                serde_json::to_string(&json).expect("should convert."),
            )
            .build();
        let template = mustache::compile_str(template).expect("should compile template.");
        template
            .render_data(&mut std::io::stdout(), &data)
            .expect("should render report.");
    }
}
