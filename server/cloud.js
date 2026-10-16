// 云端入口：与 server/index.js 同一份代码，只是先打开公网模式。
// 本机用法仍然是 `npm start`（走 index.js），行为完全不变。
process.env.PUBLIC_MODE = '1';
await import('./index.js');
