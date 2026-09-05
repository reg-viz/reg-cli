# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## @0.19.0-rc2 (5 September, 2026)

- perf(core): avoid diff-image encoding for threshold-accepted changes and adaptively parallelize smaller batches of large screenshots
- perf(wasm): reuse the compiled WebAssembly module across Rayon workers
- perf(report): skip HTML rendering and collection cloning when no HTML report is requested
- fix(core): ignore macOS AppleDouble image sidecars during image discovery
- deps: update image-diff-rs to 0.1.2

## @0.19.0-rc1 (5 September, 2026)

- fix(wasm): write diff images as each comparison completes instead of retaining the whole batch in memory, and raise the linear-memory limit from 1 GiB to 4 GiB ([#654](https://github.com/reg-viz/reg-cli/pull/654), [#668](https://github.com/reg-viz/reg-cli/issues/668))
- perf(core): reduce per-image tracing, cloning, and image-walking allocation overhead
- security: pass only declared WASI imports to the Wasm instance and update vulnerable dependencies

## @0.19.0-rc0 (4 May, 2026)

- feat: Wasm-backed rewrite (Rust + Rayon) — drop-in compatible with the classic `reg-cli` flags, `reg.json`/JUnit schema, and `compare()` EventEmitter API
- perf: up to ~2.86× faster than `reg-cli@0.18.16` on large images (see README "Performance")
- chore: this release was previously published experimentally as `@bokuweb/reg-cli-wasm`; it now takes over the canonical `reg-cli` name on npm

## @0.18.16 (3 May, 2026)

- update dependencies

## @0.18.15 (3 May, 2026)

- update dependencies

## @0.18.14 (24 Dec, 2025)

- update dependencies

## @0.18.13 (26 Oct, 2025)

- update dependencies

## @0.18.10 (8 Dec, 2024)

- feat: Report UI v0.5.0

## @0.18.9 (25 Nov, 2024)

- fix(deps): update dependency cross-spawn to v7.0.5 [security]

## @0.18.8 (2 Oct, 2024)

- update dependencies

## @0.18.7 (18 Aug, 2024)

- feat: Report UI v0.4.0

## @0.18.6 (17. Jun, 2024)

- update dependency braces to v3.0.3 [security] 

## @0.18.5 (29. April, 2024)

- fixed a bug, style.css is not included.

## @0.18.2 (29. April, 2024)

- feat: Report UI v0.3.0

## @0.17.6 (6. March, 2022)

- feat: adds support for a custom diff message #439
