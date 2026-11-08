import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';

const server = app.listen(config.port, () => {
  console.log(`collegeHub API listening on :${config.port} (${config.env})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
