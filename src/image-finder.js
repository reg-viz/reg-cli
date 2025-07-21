import glob from 'glob'; // $FlowIgnore
import path from 'path';
import { createSyncSpan } from './tracing';

const difference = (arrA, arrB) => arrA.filter(a => !arrB.includes(a));

const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

export const findImages = (expectedDir, actualDir) => {
  return createSyncSpan('findImages', () => {
    console.log(`[Image Finder] Starting file discovery`);
    console.log(`[Image Finder] Expected dir: ${expectedDir}`);
    console.log(`[Image Finder] Actual dir: ${actualDir}`);
    console.log(`[Image Finder] Pattern: ${IMAGE_FILES}`);

    const expectedImages = createSyncSpan('find-expected-images', () => {
      console.log(`[Image Finder] Scanning expected directory...`);
      const results = glob
        .sync(`${expectedDir}${IMAGE_FILES}`)
        .map(p => path.relative(expectedDir, p))
        .map(p => (p[0] === path.sep ? p.slice(1) : p));
      console.log(`[Image Finder] Found ${results.length} expected images`);
      return results;
    });
    
    const actualImages = createSyncSpan('find-actual-images', () => {
      console.log(`[Image Finder] Scanning actual directory...`);
      const results = glob
        .sync(`${actualDir}${IMAGE_FILES}`)
        .map(p => path.relative(actualDir, p))
        .map(p => (p[0] === path.sep ? p.slice(1) : p));
      console.log(`[Image Finder] Found ${results.length} actual images`);
      return results;
    });
    
    const { deletedImages, newImages } = createSyncSpan('calculate-differences', () => {
      console.log(`[Image Finder] Calculating differences...`);
      const deletedImages = difference(expectedImages, actualImages);
      const newImages = difference(actualImages, expectedImages);
      console.log(`[Image Finder] Deleted images: ${deletedImages.length}`);
      console.log(`[Image Finder] New images: ${newImages.length}`);
      return { deletedImages, newImages };
    });

    console.log(`[Image Finder] File discovery completed`);
    console.log(`[Image Finder] Total expected: ${expectedImages.length}, actual: ${actualImages.length}`);
    
    return {
      expectedImages,
      actualImages,
      deletedImages,
      newImages,
    };
  });
};
