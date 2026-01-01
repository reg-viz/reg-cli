import { run } from './';

// WASI expects argv[0] to be the program name, use '--' as placeholder
const emitter = run(['--', ...process.argv.slice(2)]);

emitter.on('complete', data => {});
