/* @flow */

import { imgDiff } from 'img-diff-js'; // $FlowIgnore
import md5File from 'md5-file'; // $FlowIgnore
import path from 'path';

export type DiffCreatorParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  image: string;
  matchingThreshold: number,
  thresholdRate?: number,
  thresholdPixel?: number,
  enableAntialias: boolean;
}

export type DiffResult = {
  image: string;
  passed: boolean;
}

const getMD5 = (file) => new Promise((resolve, reject) => {
  md5File(file, (err, hash) => {
    if (err) reject(err);
    resolve(hash);
  })
});

const isPassed = ({ width, height, diffCount, thresholdPixel, thresholdRate }: {
  width: number,
  height: number,
  diffCount: number,
  thresholdPixel?: number,
  thresholdRate?: number
}) => {
  if (typeof thresholdPixel === "number") {
    return diffCount <= thresholdPixel;
  } else if (typeof thresholdRate === "number") {
    const totalPixel = width * height;
    const ratio = diffCount / totalPixel;
    return ratio <= thresholdRate;
  }
  return diffCount === 0;
};

const createDiff = ({
  actualDir, expectedDir, diffDir, image, matchingThreshold, thresholdRate, thresholdPixel, enableAntialias
}: DiffCreatorParams) => {
  const debug = process.env.REG_DEBUG || false;
  
  if (debug) console.log(`[DIFF] Starting comparison for image: ${image}`);
  if (debug) console.log(`[DIFF] Directories - actual: ${actualDir}, expected: ${expectedDir}, diff: ${diffDir}`);
  
  return Promise.all([
    getMD5(path.join(actualDir, image)),
    getMD5(path.join(expectedDir, image)),
  ]).then(([actualHash, expectedHash]) => {
    if (debug) console.log(`[DIFF] MD5 hashes - actual: ${actualHash}, expected: ${expectedHash}`);
    
    if (actualHash === expectedHash) {
      if (debug) console.log(`[DIFF] Images are identical (MD5 match), skipping pixel comparison`);
      if (!process || !process.send) return;
      return process.send({ passed: true, image });
    }
    
    const diffImage = image.replace(/\.[^\.]+$/, ".png");
    if (debug) console.log(`[DIFF] Images differ, starting pixel comparison. Output diff: ${diffImage}`);
    
    return imgDiff({
      actualFilename: path.join(actualDir, image),
      expectedFilename: path.join(expectedDir, image),
      diffFilename: path.join(diffDir, diffImage),
      options: {
        threshold: matchingThreshold,
        includeAA: !enableAntialias,
      },
    })
      .then(({ width, height, diffCount }) => {
        if (debug) console.log(`[DIFF] Pixel comparison completed - dimensions: ${width}x${height}, diffCount: ${diffCount}`);
        
        const passed = isPassed({ width, height, diffCount, thresholdPixel, thresholdRate });
        const totalPixels = width * height;
        const diffPercentage = totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0;
        
        if (debug) console.log(`[DIFF] Result - passed: ${passed}, diffPercentage: ${diffPercentage.toFixed(2)}%`);
        
        if (!process || !process.send) return;
        process.send({ 
          passed, 
          image, 
          diffDetails: {
            width,
            height,
            diffCount,
            diffPercentage
          }
        });
      })
      .catch(error => {
        console.error(`[DIFF] Error during pixel comparison for ${image}:`, error.message);
        
        // For corrupted or invalid files, treat as failed comparison
        if (!process || !process.send) return;
        process.send({ 
          passed: false, 
          image, 
          error: error.message,
          diffDetails: {
            width: 0,
            height: 0,
            diffCount: 0,
            diffPercentage: 0
          }
        });
      });
  })
  .catch(error => {
    console.error(`[DIFF] Error during MD5 comparison for ${image}:`, error.message);
    // For corrupted files, still send a result to prevent hanging
    if (!process || !process.send) return;
    process.send({ 
      passed: false, 
      image, 
      error: error.message,
      diffDetails: {
        width: 0,
        height: 0,
        diffCount: 0,
        diffPercentage: 0
      }
    });
  });
};

process.on('message', (data) => {
  createDiff(data);
});
