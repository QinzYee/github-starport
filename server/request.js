// 客户端断开检测。
// 注意：不要用 req 的 'close' —— Node 16 起，请求体读完就会触发它，
// 结果是长任务刚开始就被自己取消，而且还会因为「已取消」而不回响应，直到网关超时。
// 正确的信号是响应流的 'close'：正常结束时 writableEnded 已为 true，客户端中途离开时则为 false。
export function abortWhenClientGone(res, controller) {
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
}
