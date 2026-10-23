import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveListenPort } from '../src/utils/serverPort';

test('defaults SoccerPredict-pro to port 3001', () => {
  assert.equal(resolveListenPort([], undefined), 3001);
});

test('does not select the separate app port from environment or command line', () => {
  assert.equal(resolveListenPort([], '3000'), 3001);
  assert.equal(resolveListenPort(['--port', '3000'], undefined), 3001);
});

test('preserves an explicit safe port and avoids the container proxy port', () => {
  assert.equal(resolveListenPort(['--port', '3101'], '3201'), 3101);
  assert.equal(resolveListenPort([], '8080'), 3001);
});
