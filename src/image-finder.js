/* @flow */

import glob from 'glob'; // $FlowIgnore
import path from 'path';

const difference = (arrA, arrB) => arrA.filter(a => !arrB.includes(a));

const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

export const findImages = (expectedDir: string, actualDir: string) => {
  const expectedImages = glob
    .sync(`${expectedDir}${IMAGE_FILES}`)
    .map(p => path.relative(expectedDir, p))
    .map(p => (p[0] === path.sep ? p.slice(1) : p));
  const actualImages = glob
    .sync(`${actualDir}${IMAGE_FILES}`)
    .map(p => path.relative(actualDir, p))
    .map(p => (p[0] === path.sep ? p.slice(1) : p));
  const deletedImages = difference(expectedImages, actualImages);
  const newImages = difference(actualImages, expectedImages);
  return {
    expectedImages,
    actualImages,
    deletedImages,
    newImages,
  };
};
