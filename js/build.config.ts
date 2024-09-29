import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['./index.ts', './cli.ts', './worker.ts', './entry.ts'],
  declaration: true,
  rollup: {
    emitCJS: true,
  },
});
