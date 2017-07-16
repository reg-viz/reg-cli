type Params = {
  actualFilename: string;
  expectedFilename: string;
  diffFilename: string;
  options: {
    threshold: number;
  }
}

type Result = {
  width: number;
  height: number;
  imagesAreSame: boolean;
}

declare module 'img-diff-js' {
  declare function imgDiff(p: Params): Promise<Result>;
};

