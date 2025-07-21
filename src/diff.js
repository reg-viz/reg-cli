/* @flow */

import { imgDiff } from 'img-diff-js'; // $FlowIgnore
import md5File from 'md5-file'; // $FlowIgnore
import path from 'path';
import { createSpan, initTracing, shutdownTracing } from './tracing';
import { trace, propagation, context } from '@opentelemetry/api';

// 子プロセスでもトレーシングを初期化
initTracing();

export type DiffCreatorParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  image: string;
  matchingThreshold: number,
  thresholdRate?: number,
  thresholdPixel?: number,
  enableAntialias: boolean;
  traceContext?: any;
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
  actualDir, expectedDir, diffDir, image, matchingThreshold, thresholdRate, thresholdPixel, enableAntialias, traceContext
}: DiffCreatorParams) => {
  // 親プロセスからのトレースコンテキストを復元
  if (traceContext) {
    const parentContext = propagation.extract(context.active(), traceContext);
    return context.with(parentContext, () => {
      return createSpan(`createDiff-${image}`, () => {
        return Promise.all([
          getMD5(path.join(actualDir, image)),
          getMD5(path.join(expectedDir, image)),
        ]).then(([actualHash, expectedHash]) => {
          if (actualHash === expectedHash) {
            if (!process || !process.send) return;
            return process.send({ passed: true, image });
          }
          const diffImage = image.replace(/\.[^\.]+$/, ".png");
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
              const passed = isPassed({ width, height, diffCount, thresholdPixel, thresholdRate });
              if (!process || !process.send) return;
              process.send({ passed, image });
            })
        })
      });
    });
  } else {
    // トレースコンテキストがない場合は通常通り実行
    return createSpan(`createDiff-${image}`, () => {
      return Promise.all([
        getMD5(path.join(actualDir, image)),
        getMD5(path.join(expectedDir, image)),
      ]).then(([actualHash, expectedHash]) => {
        if (actualHash === expectedHash) {
          if (!process || !process.send) return;
          return process.send({ passed: true, image });
        }
        const diffImage = image.replace(/\.[^\.]+$/, ".png");
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
            const passed = isPassed({ width, height, diffCount, thresholdPixel, thresholdRate });
            if (!process || !process.send) return;
            process.send({ passed, image });
          })
      })
    });
  }
};

process.on('message', async (data) => {
  try {
    await createDiff(data);
    
    // スパンをエクスポートするために十分な時間を待つ
    setTimeout(async () => {
      try {
        await shutdownTracing();
      } catch (err) {
        // シャットダウンエラーは無視
      }
    }, 500); // より長い待機時間
    
  } catch (err) {
    console.error('[diff.js] Error in createDiff:', err);
    
    setTimeout(async () => {
      try {
        await shutdownTracing();
      } catch (e) {
        // シャットダウンエラーは無視
      }
    }, 500);
  }
});
