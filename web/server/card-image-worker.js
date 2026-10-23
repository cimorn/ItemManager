'use strict';
const { parentPort } = require('node:worker_threads');
const { transformCardImage } = require('./card-image-transform');
parentPort.once('message', input => {
  const result = transformCardImage(input);
  parentPort.postMessage(result);
});
