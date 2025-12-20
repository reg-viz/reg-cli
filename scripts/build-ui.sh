#!/bin/sh

VERSION=$1
DIR=report/ui

set -eux

if [ -e "$DIR" ]; then
  cd $DIR
  git fetch origin --tags
  git checkout refs/tags/$VERSION
else
  git clone https://github.com/reg-viz/reg-cli-report-ui.git -b $VERSION $DIR --depth 1
  cd $DIR
fi

# NOTE:
# - reg-cli (this repo) uses pnpm via `packageManager`.
# - When running in CI, invoking `yarn` here may fail under Corepack strictness.
# - We build report-ui with pnpm to keep the toolchain consistent.
corepack enable
corepack prepare pnpm@10.14.0 --activate

# `report-ui` repository may not ship `pnpm-lock.yaml` for the tag we build.
# Avoid `--frozen-lockfile` and let pnpm generate its lockfile if needed.
pnpm install --no-frozen-lockfile

# Build without calling `yarn`-prefixed scripts inside report-ui.
pnpm exec cross-env NODE_ENV="production" vite -c vite.config.source.js build
pnpm exec cross-env NODE_ENV="production" vite -c vite.config.worker.js build

touch .npmignore
