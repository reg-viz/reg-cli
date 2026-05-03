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
# `--ignore-workspace`: prevent pnpm from walking up and joining the
# parent repo's pnpm-workspace.yaml, which would skip installing
# report-ui's own devDeps (cross-env / vite) since report/ui isn't
# declared as a workspace member.
pnpm install --no-frozen-lockfile --ignore-workspace

# Build without calling `yarn`-prefixed scripts inside report-ui.
# Invoke directly via node_modules/.bin/ — `pnpm exec` doesn't accept
# `--ignore-workspace` (it'd try to spawn it as a command).
./node_modules/.bin/cross-env NODE_ENV="production" ./node_modules/.bin/vite -c vite.config.source.js build
./node_modules/.bin/cross-env NODE_ENV="production" ./node_modules/.bin/vite -c vite.config.worker.js build

touch .npmignore
