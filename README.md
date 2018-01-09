

<p align="center"><img src ="https://github.com/reg-viz/reg-cli/blob/master/logo.png?raw=true" /></p>

<p align="center">Visual regression test tool with html reporter.</p>

<p align="center"><a href="https://circleci.com/gh/reg-viz/reg-cli/tree/master">
<img src="https://circleci.com/gh/reg-viz/reg-cli/tree/master.svg?style=svg" alt="Build Status" /></a>
<a href="https://travis-ci.org/reg-viz/reg-cli">
<img src="https://img.shields.io/travis/reg-viz/reg-cli.svg" alt="Build Status" /></a>
<a href="https://ci.appveyor.com/project/bokuweb/reg-cli">
<img src="https://ci.appveyor.com/api/projects/status/ir907qbc633q9na4?svg=true" alt="Build Status" /></a>
<a href="https://www.npmjs.com/package/reg-cli">
<img src="https://img.shields.io/npm/v/reg-cli.svg" alt="Build Status" /></a>
<a href="https://www.npmjs.com/package/reg-cli">
<img src="https://img.shields.io/npm/dm/reg-cli.svg" /></a>
<a href="https://greenkeeper.io/">
<img src="https://badges.greenkeeper.io/reg-viz/reg-cli.svg" /></a>
</p>

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Test](#test)
- [Contribute](#contribute)
- [License](#license)

## Installation

### Requirements

 - Node.js v6+

`reg-cli` support Node.js v6+

``` sh
$ npm i -D reg-cli
```

## Usage

### CLI

``` sh
$ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir -R ./report.html
```

####  Options

  * `-U`, `--update` Update expected images.(Copy \`actual images\` to \`expected images\`).
  * `-R`, `--report` Output html report to specified directory.
  * `-J`, `--json` Specified json report path. If omitted `./reg.json`
  * `-I`, `--ignoreChange` If true, error will not be thrown when image change detected.
  * `-P`, `--urlPrefix` Add prefix to all image src.
  * `-T`, `--thresholdRate` Rate threshold for detecting change. When the difference ratio of the image is larger than the set rate detects the change.
  * `-S`, `--thresholdPixel` Pixel threshold for detecting change. When the difference pixel of the image is larger than the set pixel detects the change. This value takes precedence over `thresholdRate`.
  * `-C`, `--concurrency` How many processes launches in parallel. If omitted 4.
  * `-A`, `--enableAntialias` Enable antialias. If omitted false.
  * `-X`, `--additionalDetection`. Enable additional difference detection(highly experimental). Select "none" or "client" (default: "none").

### html report

If `-R` option set, output html report to specified directory.
https://reg-viz.github.io/reg-cli/

![screenshot](https://github.com/reg-viz/reg-cli/blob/master/docs/screenshot.png?raw=true)

## Test

``` sh
$ npm t
```

## Contribute

PRs welcome.

## License

The MIT License (MIT)

Copyright (c) 2017 bokuweb

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

