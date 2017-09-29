type Params = {
  actualFilename: string;
  expectedFilename: string;
  diffFilename: string;
  options: {
    threshold: number;
    includeAA: boolean;
  }
}

type Result = {
  width: number;
  height: number;
  imagesAreSame: boolean;
  diffCount: number;
}

declare module 'img-diff-js' {
  declare function imgDiff(p: Params): Promise<Result>;
};

