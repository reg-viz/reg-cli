use criterion::{criterion_group, criterion_main, Criterion, Throughput};
use reg_core::{run, Options};
use std::path::{Path, PathBuf};
use tempfile::TempDir;

const TINY_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
];

// 1x1 PNG with a single black pixel — differs from TINY_PNG by 1 pixel
const TINY_PNG_BLACK: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x10, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x60, 0x60, 0x60, 0x60,
    0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0x5e, 0xf3, 0x2a, 0x3a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

struct Fixture {
    _root: TempDir,
    actual: PathBuf,
    expected: PathBuf,
    diff: PathBuf,
}

fn make_fixture(n_equal: usize, n_diff: usize, nest: bool) -> Fixture {
    let root = tempfile::tempdir().unwrap();
    let actual = root.path().join("actual");
    let expected = root.path().join("expected");
    let diff = root.path().join("diff");
    std::fs::create_dir_all(&actual).unwrap();
    std::fs::create_dir_all(&expected).unwrap();
    std::fs::create_dir_all(&diff).unwrap();

    for i in 0..n_equal {
        let name = if nest && i % 4 == 0 {
            format!("sub{}/img{:04}.png", i % 8, i)
        } else {
            format!("img{:04}.png", i)
        };
        let a = actual.join(&name);
        let e = expected.join(&name);
        if let Some(p) = a.parent() {
            std::fs::create_dir_all(p).unwrap();
        }
        if let Some(p) = e.parent() {
            std::fs::create_dir_all(p).unwrap();
        }
        std::fs::write(&a, TINY_PNG).unwrap();
        std::fs::write(&e, TINY_PNG).unwrap();
    }
    for i in 0..n_diff {
        let name = format!("diff{:04}.png", i);
        std::fs::write(actual.join(&name), TINY_PNG_BLACK).unwrap();
        std::fs::write(expected.join(&name), TINY_PNG).unwrap();
    }
    Fixture {
        _root: root,
        actual,
        expected,
        diff,
    }
}

fn bench_run_all_equal(c: &mut Criterion) {
    let fixture = make_fixture(200, 0, false);
    let mut group = c.benchmark_group("run_all_equal");
    group.sample_size(20);
    group.throughput(Throughput::Elements(200));
    group.bench_function("200_equal_pairs", |b| {
        b.iter(|| {
            let json = fixture.diff.join("reg.json");
            let opts = Options {
                json: Some(Path::new(&json) as &Path),
                concurrency: Some(4),
                ..Options::default()
            };
            // SAFETY: json path lifetime — opts is dropped before fixture
            let _ = run(&fixture.actual, &fixture.expected, &fixture.diff, opts).unwrap();
        });
    });
    group.finish();
}

fn bench_run_with_diffs(c: &mut Criterion) {
    let fixture = make_fixture(50, 50, false);
    let mut group = c.benchmark_group("run_with_diffs");
    group.sample_size(15);
    group.throughput(Throughput::Elements(100));
    group.bench_function("50eq_50diff", |b| {
        b.iter(|| {
            let json = fixture.diff.join("reg.json");
            let opts = Options {
                json: Some(Path::new(&json) as &Path),
                concurrency: Some(4),
                ..Options::default()
            };
            let _ = run(&fixture.actual, &fixture.expected, &fixture.diff, opts).unwrap();
        });
    });
    group.finish();
}

fn bench_find_images_only(c: &mut Criterion) {
    // 500 image pairs, some nested, exercises walk_images + find_images.
    // We bench it indirectly by running a full `run` over identical inputs;
    // since images are byte-equal, image-diff cost is minimal and the walk
    // dominates.
    let fixture = make_fixture(500, 0, true);
    let mut group = c.benchmark_group("find_images_500");
    group.sample_size(15);
    group.throughput(Throughput::Elements(500));
    group.bench_function("500_nested_equal", |b| {
        b.iter(|| {
            let json = fixture.diff.join("reg.json");
            let opts = Options {
                json: Some(Path::new(&json) as &Path),
                concurrency: Some(4),
                ..Options::default()
            };
            let _ = run(&fixture.actual, &fixture.expected, &fixture.diff, opts).unwrap();
        });
    });
    group.finish();
}

criterion_group!(benches, bench_run_all_equal, bench_run_with_diffs, bench_find_images_only);
criterion_main!(benches);
