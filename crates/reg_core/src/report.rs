use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use bytes::Bytes;
use mustache::MapBuilder;
use serde::{Deserialize, Serialize};

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
    pub(crate) report: &'a Path,
    // extendedErrors: boolean,
    pub(crate) url_prefix: Option<url::Url>,
    pub(crate) enable_client_additional_detection: bool,
    pub(crate) from_json: bool,
    pub(crate) diff_image_extention: &'static str,
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

#[derive(Debug, Serialize, Deserialize)]
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

    let html_report = {
        let report = input.report;
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
            diff_image_extention: input.diff_image_extention,
            ximgdiff_config: XimgdiffConfig {
                enabled: input.enable_client_additional_detection,
                worker_url: "./worker.js".to_string(),
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
    };

    Reports {
        json: json_report,
        html: html_report,
    }
}

/// Build a JUnit XML document byte-compatible with classic reg-cli's
/// `src/report.js` output (via `xmlbuilder2`).
///
/// ```xml
/// <?xml version="1.0"?>
/// <testsuites name="reg-cli tests" tests="N" failures="M">
///   <testsuite name="reg-cli" tests="N" failures="M">
///     <testcase name="passed.png"/>
///     <testcase name="failed.png">
///       <failure message="failed"/>
///     </testcase>
///   </testsuite>
/// </testsuites>
/// ```
///
/// Semantics (match classic exactly):
///   - `failedItems` always emit `<failure message="failed"/>`.
///   - `newItems` / `deletedItems` become `<failure message="newItem"|"deletedItem"/>`
///     ONLY when `extended_errors` is set; otherwise they are reported as
///     passed testcases.
///   - `passedItems` emit bare `<testcase name="..."/>`.
///   - `tests` / `failures` attributes appear on BOTH `<testsuites>` and the
///     nested `<testsuite>`.
///   - Output is pretty-printed with 2-space indent, no `encoding=`
///     declaration, no trailing newline (xmlbuilder2's `prettyPrint: true`).
pub(crate) fn build_junit_xml(report: &JsonReport, extended_errors: bool) -> String {
    fn esc(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }

    // Classify items. In non-extended mode, new/deleted are treated as
    // successful tests so CI doesn't go red on baseline additions.
    let mut passed_names: Vec<String> = Vec::new();
    let mut failure_cases: Vec<(String, &'static str)> = Vec::new();

    for p in &report.failed_items {
        failure_cases.push((p.display().to_string(), "failed"));
    }
    for p in &report.new_items {
        if extended_errors {
            failure_cases.push((p.display().to_string(), "newItem"));
        } else {
            passed_names.push(p.display().to_string());
        }
    }
    for p in &report.deleted_items {
        if extended_errors {
            failure_cases.push((p.display().to_string(), "deletedItem"));
        } else {
            passed_names.push(p.display().to_string());
        }
    }
    for p in &report.passed_items {
        passed_names.push(p.display().to_string());
    }

    let failures = failure_cases.len();
    let tests = passed_names.len() + failures;

    // Classic's testcase ordering is: failed, new, deleted, passed (the order
    // classic's forEach loop visits them). `failure_cases` already holds
    // failed→new→deleted in that order; `passed_names` holds
    // new-treated-as-passed → deleted-as-passed → passed in order.
    let mut cases: Vec<String> = Vec::with_capacity(tests);
    for p in &report.failed_items {
        cases.push(format!(
            "    <testcase name=\"{}\">\n      <failure message=\"failed\"/>\n    </testcase>",
            esc(&p.display().to_string())
        ));
    }
    for p in &report.new_items {
        if extended_errors {
            cases.push(format!(
                "    <testcase name=\"{}\">\n      <failure message=\"newItem\"/>\n    </testcase>",
                esc(&p.display().to_string())
            ));
        } else {
            cases.push(format!(
                "    <testcase name=\"{}\"/>",
                esc(&p.display().to_string())
            ));
        }
    }
    for p in &report.deleted_items {
        if extended_errors {
            cases.push(format!(
                "    <testcase name=\"{}\">\n      <failure message=\"deletedItem\"/>\n    </testcase>",
                esc(&p.display().to_string())
            ));
        } else {
            cases.push(format!(
                "    <testcase name=\"{}\"/>",
                esc(&p.display().to_string())
            ));
        }
    }
    for p in &report.passed_items {
        cases.push(format!(
            "    <testcase name=\"{}\"/>",
            esc(&p.display().to_string())
        ));
    }

    // No encoding attr, no trailing newline — matches xmlbuilder2's default
    // when created with `{ version: '1.0' }` and rendered with `prettyPrint: true`.
    if cases.is_empty() {
        format!(
            "<?xml version=\"1.0\"?>\n<testsuites name=\"reg-cli tests\" tests=\"{tests}\" failures=\"{failures}\">\n  <testsuite name=\"reg-cli\" tests=\"{tests}\" failures=\"{failures}\"/>\n</testsuites>"
        )
    } else {
        format!(
            "<?xml version=\"1.0\"?>\n<testsuites name=\"reg-cli tests\" tests=\"{tests}\" failures=\"{failures}\">\n  <testsuite name=\"reg-cli\" tests=\"{tests}\" failures=\"{failures}\">\n{cases}\n  </testsuite>\n</testsuites>",
            cases = cases.join("\n"),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_report(
        passed: &[&str],
        failed: &[&str],
        new: &[&str],
        deleted: &[&str],
    ) -> JsonReport {
        let to_set = |s: &[&str]| -> BTreeSet<PathBuf> {
            s.iter().map(|x| PathBuf::from(x)).collect()
        };
        JsonReport {
            passed_items: to_set(passed),
            failed_items: to_set(failed),
            new_items: to_set(new),
            deleted_items: to_set(deleted),
            // The rest are irrelevant to junit output; empty is fine.
            expected_items: BTreeSet::new(),
            actual_items: BTreeSet::new(),
            diff_items: BTreeSet::new(),
            actual_dir: String::new(),
            expected_dir: String::new(),
            diff_dir: String::new(),
        }
    }

    // Reference bytes come from classic reg-cli (src/report.js via
    // xmlbuilder2, { version: '1.0' }, prettyPrint: true). The
    // `test/cli.test.mjs` snapshot tests pin these exact bytes, so the
    // expected strings below are the same ones the classic test suite
    // asserts on.

    #[test]
    fn junit_single_failure() {
        let r = mk_report(&[], &["sample(cal).png"], &[], &[]);
        let xml = build_junit_xml(&r, /*extended=*/ false);
        assert_eq!(
            xml,
            r#"<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="1" failures="1">
  <testsuite name="reg-cli" tests="1" failures="1">
    <testcase name="sample(cal).png">
      <failure message="failed"/>
    </testcase>
  </testsuite>
</testsuites>"#
        );
    }

    #[test]
    fn junit_passed_and_failed_mix() {
        let r = mk_report(&["ok.png"], &["bad.png"], &[], &[]);
        let xml = build_junit_xml(&r, false);
        assert_eq!(
            xml,
            r#"<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="2" failures="1">
  <testsuite name="reg-cli" tests="2" failures="1">
    <testcase name="bad.png">
      <failure message="failed"/>
    </testcase>
    <testcase name="ok.png"/>
  </testsuite>
</testsuites>"#
        );
    }

    #[test]
    fn junit_new_and_deleted_not_extended_are_passed() {
        // Without -E, new/deleted items are counted as passed tests.
        let r = mk_report(&[], &[], &["added.png"], &["gone.png"]);
        let xml = build_junit_xml(&r, false);
        assert_eq!(
            xml,
            r#"<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="2" failures="0">
  <testsuite name="reg-cli" tests="2" failures="0">
    <testcase name="added.png"/>
    <testcase name="gone.png"/>
  </testsuite>
</testsuites>"#
        );
    }

    #[test]
    fn junit_new_and_deleted_extended_are_failures() {
        // With -E, they become <failure message="newItem"|"deletedItem"/>.
        let r = mk_report(&[], &[], &["added.png"], &["gone.png"]);
        let xml = build_junit_xml(&r, true);
        assert_eq!(
            xml,
            r#"<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="2" failures="2">
  <testsuite name="reg-cli" tests="2" failures="2">
    <testcase name="added.png">
      <failure message="newItem"/>
    </testcase>
    <testcase name="gone.png">
      <failure message="deletedItem"/>
    </testcase>
  </testsuite>
</testsuites>"#
        );
    }

    #[test]
    fn junit_escapes_xml_special_chars_in_name() {
        let r = mk_report(&[], &[r#"a&b<c>d".png"#], &[], &[]);
        let xml = build_junit_xml(&r, false);
        // Only attribute-value escapes matter here (name="..."). Classic
        // xmlbuilder2 also escapes all five, but quoting is consistent.
        assert!(xml.contains(r#"name="a&amp;b&lt;c&gt;d&quot;.png""#));
    }

    #[test]
    fn junit_empty_report_has_self_closing_testsuite() {
        let r = mk_report(&[], &[], &[], &[]);
        let xml = build_junit_xml(&r, false);
        assert_eq!(
            xml,
            r#"<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="0" failures="0">
  <testsuite name="reg-cli" tests="0" failures="0"/>
</testsuites>"#
        );
    }
}
