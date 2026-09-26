const path = require('node:path');
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'dating.db');

createApp({ dbPath }).listen(port, () => {
  console.log(`Dating app running at http://localhost:${port}`);
});
