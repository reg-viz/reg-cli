fn main() {
    let a = include_bytes!("../../sample/actual/sample.png");
    let b = include_bytes!("../../sample/expected/sample.png");
    dbg!(image_diff_rs::diff(
        a,
        b,
        &image_diff_rs::DiffOption {
            threshold: Some(0.1),
            include_anti_alias: Some(true),
        },
    )
    .unwrap());
}
