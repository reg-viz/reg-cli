
/* @flow */

const { imgDiff } = require('img-diff-js'); // $FlowIgnore
const md5File = require('md5-file'); // $FlowIgnore

export type DiffCreatorParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  image: string;
  threshold: number;
}

const getMD5 = (file) => new Promise((resolve, reject) => {
  md5File(file, (err, hash) => {
    if (err) reject(err);
    resolve(hash);
  })
});

const createDiff = ({ actualDir, expectedDir, diffDir, image, threshold }: DiffCreatorParams) => {
  return Promise.all([
    getMD5(`${actualDir}${image}`),
    getMD5(`${expectedDir}${image}`),
  ]).then(([actualHash, expectedHash]) => {
    if (actualHash === expectedHash) {
      return process.send({ passed: true, image });
    }
    const diffImage = image.replace(/\.[^\.]+$/, ".png");
    return imgDiff({
      actualFilename: `${actualDir}${image}`,
      expectedFilename: `${expectedDir}${image}`,
      diffFilename: `${diffDir}${diffImage}`,
      options: {
        threshold,
      },
    })
      .then((result) => {
        const passed = result.imagesAreSame;
        process.send({ passed, image });
      })
  })
};

process.on('message', (data) => {
  createDiff(data);
});















