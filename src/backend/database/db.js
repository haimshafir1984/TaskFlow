const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db;
let dbPath;

async function initDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  dbPath = path.join(dataDir, 'taskflow.sqlite');
  const SQL = await initSqlJs({ locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file) });
  const bytes = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  db = new PersistedDatabase(bytes ? new SQL.Database(bytes) : new SQL.Database(), dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateExistingDatabase();
  seedDefaults();
  db.persist();
  return { db, dbPath };
}

class PersistedDatabase {
  constructor(database, filePath) {
    this.database = database;
    this.filePath = filePath;
  }

  pragma(sql) {
    this.database.run(`PRAGMA ${sql}`);
  }

  exec(sql) {
    this.database.exec(sql);
    this.persist();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  transaction(fn) {
    return (payload) => {
      const result = fn(payload);
      this.persist();
      return result;
    };
  }

  persist() {
    fs.writeFileSync(this.filePath, Buffer.from(this.database.export()));
  }
}

class Statement {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
  }

  all(...params) {
    const statement = this.owner.database.prepare(this.sql);
    statement.bind(normalizeParams(params));
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    return rows;
  }

  get(...params) {
    return this.all(...params)[0];
  }

  run(...params) {
    const statement = this.owner.database.prepare(this.sql);
    statement.bind(normalizeParams(params));
    statement.step();
    statement.free();
    const result = this.owner.database.exec('SELECT last_insert_rowid()');
    const lastInsertRowid = result.length ? result[0].values[0][0] : 0;
    this.owner.persist();
    return { lastInsertRowid };
  }
}

function normalizeParams(params) {
  if (params.length === 1) {
    const value = params[0];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [`@${key}`, item]));
    }
    return [value];
  }
  return params;
}

function migrateExistingDatabase() {
  const categoryColumns = db.prepare('PRAGMA table_info(categories)').all().map((column) => column.name);
  if (!categoryColumns.includes('description')) {
    db.exec("ALTER TABLE categories ADD COLUMN description TEXT DEFAULT ''");
  }

  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map((column) => column.name);
  if (!taskColumns.includes('category_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN category_id INTEGER');
  }

  const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map((column) => column.name);
  if (!projectColumns.includes('category_id')) {
    db.exec('ALTER TABLE projects ADD COLUMN category_id INTEGER');
  }

  migrateProjectUniqueness();
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_category_id ON projects(category_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON tasks(category_id)');
}

function migrateProjectUniqueness() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get();
  if (!row?.sql || !row.sql.includes('name TEXT NOT NULL UNIQUE')) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE projects_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER,
      color TEXT NOT NULL DEFAULT '#2f80ed',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      UNIQUE (category_id, name)
    );
    INSERT INTO projects_new (id, name, category_id, color, description, created_at, updated_at)
    SELECT id, name, category_id, color, description, created_at, updated_at FROM projects;
    DROP TABLE projects;
    ALTER TABLE projects_new RENAME TO projects;
    PRAGMA foreign_keys = ON;
  `);
}

function seedDefaults() {
  const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, color, sort_order) VALUES (?, ?, ?)');
  insertCategory.run('\u05de\u05e9\u05d9\u05de\u05d5\u05ea \u05d0\u05d9\u05e9\u05d9\u05d5\u05ea', '#2f80ed', 1);
  insertCategory.run('\u05e1\u05d9\u05d3\u05d5\u05e8\u05d9\u05dd', '#12a594', 2);
  insertCategory.run('\u05de\u05e9\u05e4\u05d7\u05d4', '#ef5350', 3);
  insertCategory.run('\u05e4\u05d9\u05ea\u05d5\u05d7 \u05e2\u05e1\u05e7\u05d9', '#8b5cf6', 4);
  insertCategory.run('\u05e7\u05e0\u05d9\u05d5\u05ea', '#f59e0b', 5);

  const businessId = getCategoryId('\u05e4\u05d9\u05ea\u05d5\u05d7 \u05e2\u05e1\u05e7\u05d9');
  const shoppingId = getCategoryId('\u05e7\u05e0\u05d9\u05d5\u05ea');

  const projectCount = db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
  if (projectCount === 0) {
    const insertProject = db.prepare('INSERT INTO projects (name, category_id, color, description) VALUES (?, ?, ?, ?)');
    insertProject.run('\u05db\u05dc\u05dc\u05d9', businessId, '#2f80ed', '\u05ea\u05ea \u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4 \u05db\u05dc\u05dc\u05d9\u05ea \u05dc\u05e4\u05d9\u05ea\u05d5\u05d7 \u05e2\u05e1\u05e7\u05d9');
    insertProject.run('\u05e2\u05d1\u05d5\u05d3\u05d4', businessId, '#12a594', '\u05de\u05e9\u05d9\u05de\u05d5\u05ea \u05e2\u05d1\u05d5\u05d3\u05d4 \u05d5\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea');
    insertProject.run('\u05d0\u05d9\u05e9\u05d9', businessId, '#f59e0b', '\u05ea\u05ea \u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4 \u05e7\u05d9\u05d9\u05de\u05ea');
  } else if (businessId) {
    db.prepare('UPDATE projects SET category_id = ? WHERE category_id IS NULL').run(businessId);
  }

  const insertShoppingProject = db.prepare('INSERT OR IGNORE INTO projects (name, category_id, color, description) VALUES (?, ?, ?, ?)');
  insertShoppingProject.run('\u05e7\u05e0\u05d9\u05d5\u05ea \u05e7\u05d8\u05e0\u05d5\u05ea', shoppingId, '#38bdf8', '');
  insertShoppingProject.run('\u05e7\u05e0\u05d9\u05d5\u05ea \u05d2\u05d3\u05d5\u05dc\u05d5\u05ea', shoppingId, '#f97316', '');
  insertShoppingProject.run('\u05e1\u05d5\u05e4\u05e8 \u05d5\u05de\u05d5\u05e6\u05e8\u05d9 \u05de\u05d6\u05d5\u05df', shoppingId, '#22c55e', '');

  db.prepare('UPDATE tasks SET category_id = (SELECT category_id FROM projects WHERE projects.id = tasks.project_id) WHERE category_id IS NULL AND project_id IS NOT NULL').run();

  const setting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setting.run('theme', 'light');
  setting.run('language', 'he');
}

function getCategoryId(name) {
  return db.prepare('SELECT id FROM categories WHERE name = ?').get(name)?.id || null;
}

function getDb() {
  if (!db) throw new Error('Database was not initialized');
  return db;
}

module.exports = { initDatabase, getDb };


