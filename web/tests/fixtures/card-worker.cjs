const { parentPort } = require('node:worker_threads');
parentPort.once('message', ({ mode }) => {
  if (mode === 'hang') setInterval(() => {}, 1000);
  else if (mode === 'error') throw new Error('fixture worker failure');
  else if (mode === 'exit') process.exit(1);
  else parentPort.postMessage({ bytes: Buffer.from('preview'), mime: 'image/jpeg' });
});
