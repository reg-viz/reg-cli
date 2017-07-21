# reg-cli

Visual regression test tool.

[![Build Status](https://travis-ci.org/reg-viz/reg-cli.svg?branch=master)](https://travis-ci.org/reg-viz/reg-cli)
[![Version](https://img.shields.io/npm/v/reg-cli.svg)](https://www.npmjs.com/package/reg-cli)
[![Greenkeeper badge](https://badges.greenkeeper.io/reg-viz/reg-cli.svg)](https://greenkeeper.io/)

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
  * `-T`, `--threshold` Threshold for detecting change. Value can range from 0.00 (no difference) to 1.00 (every pixel is different)
  
### html report

If `-R` option set, output html report to specfied directory.   
https://bokuweb.github.io/reg-cli/   

![screenshot](https://github.com/bokuweb/reg-cli/blob/master/docs/screenshot.png?raw=true)

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

