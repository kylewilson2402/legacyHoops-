// Runs the schema on boot. CREATE TABLE IF NOT EXISTS makes this idempotent,
// so it's safe to call every startup.

const fs = require('fs');
const path = require('path');
const db = require('./connection');

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

module.exports = migrate;

// Allow `node src/db/migrate.js` for manual setup.
if (require.main === module) {
  migrate();
  console.log('Migration complete.');
}
