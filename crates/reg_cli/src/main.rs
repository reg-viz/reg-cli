use clap::Parser;
use reg_core::{run, Options};
use std::path::{Path, PathBuf};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    actual_dir: PathBuf,

    #[arg(long)]
    expected_dir: PathBuf,

    #[arg(long)]
    diff_dir: PathBuf,

    #[arg(long)]
    report: Option<PathBuf>,

    #[arg(long)]
    threshold_rate: Option<f32>,

    #[arg(long)]
    threshold_pixel: Option<u64>,

    #[arg(long)]
    concurrency: Option<usize>,

    #[arg(long)]
    enable_antialias: Option<bool>,
}

pub fn main() {
    let args = Args::parse();

    let options = Options {
        report: args.report.as_deref().map(Path::new),
        threshold_rate: args.threshold_rate,
        threshold_pixel: args.threshold_pixel,
        concurrency: args.concurrency,
        enable_antialias: args.enable_antialias,
    };

    run(args.actual_dir, args.expected_dir, args.diff_dir, options)
}
