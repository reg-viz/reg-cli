// @flow
//
// Flow stubs for runtime dependencies.
//
// The repository ignores `node_modules/` in `.flowconfig`, which means any
// `import ... from '<pkg>'` that isn't suppressed with `// $FlowIgnore` or
// declared here surfaces as a "Cannot resolve module" error. This file
// declares the third-party modules that src/ imports so flow 0.77 can type-
// check the project.

declare module 'cli-spinner' {
  declare class Spinner {
    constructor(text?: string): Spinner;
    setSpinnerString(s: number | string): void;
    setSpinnerTitle(s: string): void;
    start(): void;
    stop(clear?: boolean): void;
  }
  declare module.exports: { Spinner: typeof Spinner };
}

declare module 'meow' {
  declare module.exports: any;
}

declare module 'img-diff-js' {
  declare module.exports: any;
}

declare module 'x-img-diff-js' {
  declare module.exports: any;
}

declare module 'glob' {
  declare module.exports: any;
}

declare module 'md5-file' {
  declare module.exports: any;
}

declare module 'make-dir' {
  declare module.exports: any;
}

declare module 'del' {
  declare module.exports: any;
}

declare module 'lodash' {
  declare module.exports: any;
}

declare module 'chalk' {
  declare module.exports: any;
}

declare module 'mustache' {
  declare module.exports: any;
}

declare module 'xmlbuilder2' {
  declare module.exports: any;
}

declare module 'bluebird' {
  declare module.exports: any;
}
