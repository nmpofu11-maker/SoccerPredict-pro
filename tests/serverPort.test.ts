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

test('preserves an explicit safe port and avoids the container proxy port locally', () => {
  assert.equal(resolveListenPort(['--port', '3101'], '3201'), 3101);
  assert.equal(resolveListenPort([], '8080'), 3001);
});

test('honors AI Studio DEFAULT_APP_PORT and standalone Cloud Run PORT', () => {
  assert.equal(
    resolveListenPort(['--port', '3000'], '8080', { DEFAULT_APP_PORT: '3000', NGINX_PORT: '8080', K_SERVICE: 'ais-dev' }),
    3000
  );
  assert.equal(
    resolveListenPort([], '8080', { K_SERVICE: 'soccerpredict-pro' }),
    8080
  );
});
