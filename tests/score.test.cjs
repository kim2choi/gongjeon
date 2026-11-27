const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../orbit-sound.js');

test('the first audible sample follows the moon across phase zero', async () => {
  const sound = new window.OrbitSound();
  const options = {
    bpm: 96, preset: 0, space: 0.4, phases: [0.75,0,0,0],
    enabled: [true,false,false,false], cycles: [2,3,4,6],
  };
  const render = async settings => Buffer.from(await (await sound.renderWav(settings)).arrayBuffer());
  const wav = await render(options);
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt32LE(40), wav.length - 44);

  const framesToGate = Math.round((1 - 0.75) * (480 / 96) * 44100 / 2);
  const byteAtGate = 44 + 4 * framesToGate;
  assert.ok(!wav.subarray(44, byteAtGate).some(Boolean));
  assert.ok(wav.subarray(byteAtGate, byteAtGate + 512).some(Boolean));

  const muted = await render({ ...options, enabled: [false,false,false,false] });
  assert.ok(!muted.subarray(44).some(Boolean));
  assert.deepEqual(await render(options), wav);
});
