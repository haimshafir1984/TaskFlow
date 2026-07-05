const path = require('path');
const { startServer } = require('../backend/server');

const port = Number(process.env.PORT || 3012);
const dataDir = process.env.TASKFLOW_DATA_DIR || path.join(__dirname, '..', '..', 'data');

startServer({ dataDir, port, host: process.env.HOST || '0.0.0.0' })
  .then(({ port: runningPort, dbPath }) => {
    console.log(`TaskFlow PWA is running on http://localhost:${runningPort}`);
    console.log(`Central SQLite database: ${dbPath}`);
    console.log(`Initial password: ${process.env.TASKFLOW_INITIAL_PASSWORD || '123456'}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
