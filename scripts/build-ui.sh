#!/bin/sh
# TODO Add Git tag (e.g. `-b v1.0.0`)
git clone https://github.com/reg-viz/reg-cli-report-ui.git report/ui --depth 1
cd report/ui
yarn install --frozen-lockfile
yarn build
