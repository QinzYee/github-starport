import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { abortWhenClientGone } from '../server/request.js';

function response(writableEnded) {
  const res = new EventEmitter();
  res.writableEnded = writableEnded;
  return res;
}

test('响应正常结束后不取消任务', () => {
  const controller = new AbortController();
  const res = response(true);
  abortWhenClientGone(res, controller);
  res.emit('close');
  assert.equal(controller.signal.aborted, false);
});

test('客户端中途断开时取消任务', () => {
  const controller = new AbortController();
  const res = response(false);
  abortWhenClientGone(res, controller);
  res.emit('close');
  assert.equal(controller.signal.aborted, true);
});

test('请求体读完不触发取消（回归：不能用 req 的 close 当断开信号）', () => {
  const controller = new AbortController();
  const req = new EventEmitter();
  const res = response(false);
  abortWhenClientGone(res, controller);
  // Node 16 起，请求读完就会在 req 上触发 close；此时任务必须继续跑。
  req.emit('close');
  assert.equal(controller.signal.aborted, false);
  res.emit('close');
  assert.equal(controller.signal.aborted, true);
});
