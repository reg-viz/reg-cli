/* @flow */

import { imgDiff } from 'img-diff-js'; // $FlowIgnore
import md5File from 'md5-file'; // $FlowIgnore

export type DiffCreatorParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  image: string;
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
  if (typeof thresholdPixel !== "undefined" && !Number.isNaN(thresholdPixel)) {
    return diffCount <= thresholdPixel;
  } else if (typeof thresholdRate !== "undefined" && !Number.isNaN(thresholdPixel)) {
    const totalPixel = width * height;
    const ratio = diffCount / totalPixel;
    return ratio <= thresholdRate;
  }
  return diffCount === 0;
};

const createDiff = ({
  actualDir, expectedDir, diffDir, image, thresholdRate, thresholdPixel, enableAntialias
}: DiffCreatorParams) => {
  return Promise.all([
    getMD5(`${actualDir}${image}`),
    getMD5(`${expectedDir}${image}`),
  ]).then(([actualHash, expectedHash]) => {
    if (actualHash === expectedHash) {
      if (!process || !process.send) return;
      return process.send({ passed: true, image });
    }
    const diffImage = image.replace(/\.[^\.]+$/, ".png");
    return imgDiff({
      actualFilename: `${actualDir}${image}`,
      expectedFilename: `${expectedDir}${image}`,
      diffFilename: `${diffDir}${diffImage}`,
      options: {
        threshold: 0,
        includeAA: !enableAntialias,
      },
    })
      .then(({ width, height, diffCount }) => {
        const passed = isPassed({ width, height, diffCount, thresholdPixel, thresholdRate });
        if (!process || !process.send) return;
        process.send({ passed, image });
      })
  })
};

process.on('message', (data) => {
  createDiff(data);
});
