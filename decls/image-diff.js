type Params = {
  actualImage: string;
  expectedImage: string;
  diffImage: string;
  shadow: boolean;
}

declare module 'image-diff' {
  declare module.exports: (params: Params, cb: Function) => void;
};


