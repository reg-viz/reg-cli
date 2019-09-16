#!/bin/sh
VERSION=$1
DIR=report/ui

if [ -e "$DIR" ]; then
  cd $DIR
  git fetch origin
  git checkout refs/tags/$VERSION
else
  git clone https://github.com/reg-viz/reg-cli-report-ui.git -b $VERSION $DIR --depth 1
  cd $DIR
fi

yarn install --frozen-lockfile
yarn build
sed -i -e "s/\/dist/# \/dist/g" $DIR/.gitignore