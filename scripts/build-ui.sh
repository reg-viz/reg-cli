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

yarn install --frozen-lockfile

yarn build

touch .npmignore
