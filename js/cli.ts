import { run } from './';

const emitter = run(process.argv.slice(2));

emitter.on('complete', (data) => {
  console.log(data);
});
