use core::{run, Options};
use std::path::Path;

pub fn main() {
    run(
        "./sample/actual",
        "./sample/expected",
        "./sample/diff",
        Options {
            report: Some(Path::new("./report.html")),
            ..Default::default()
        },
    )
}
