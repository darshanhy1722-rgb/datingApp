const path = require('node:path');
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'dating.db');
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

createApp({ dbPath, uploadDir }).listen(port, () => {
  console.log(`Dating app running at http://localhost:${port}`);
});
