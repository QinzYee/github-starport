import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(root, 'dist')));
app.listen(Number(process.env.PORT || 4318), '127.0.0.1', () => console.log(`Static portal preview: http://127.0.0.1:${process.env.PORT || 4318}`));
