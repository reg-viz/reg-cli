use core::{run, Options};

pub fn main() {
    run(
        "../../sample/actual",
        "../../sample/expected",
        "../../sample/diff",
        Options::default(),
    )
}
