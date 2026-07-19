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

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrateExistingDatabase() {
  ensureColumn('categories', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('projects', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('contacts', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('priorities', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('tasks', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

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
  migrateCategoryUniqueness();
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_category_id ON projects(category_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON tasks(category_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_priorities_user_id ON priorities(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_statuses_user_id ON statuses(user_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, name)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_priorities_user_key ON priorities(user_id, key)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_statuses_user_key ON statuses(user_id, key)');
  seedStatusesForExistingUsers();
  backfillMissingCategoriesForExistingUsers();
}

function seedStatusesForExistingUsers() {
  const users = db.prepare('SELECT id FROM users').all();
  const countForUser = db.prepare('SELECT COUNT(*) AS count FROM statuses WHERE user_id = ?');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO statuses (user_id, key, name, color, sort_order, is_done)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  users.forEach((user) => {
    if ((countForUser.get(user.id)?.count || 0) > 0) return;
    insert.run(user.id, 'open', 'פתוחה', '#2563eb', 1, 0);
    insert.run(user.id, 'in_progress', 'בתהליך', '#b45309', 2, 0);
    insert.run(user.id, 'completed', 'הושלמה', '#047857', 3, 1);
    insert.run(user.id, 'blocked', 'חסומה', '#b91c1c', 4, 0);
  });
}

function migrateCategoryUniqueness() {
  // Older installations may have a leftover single-column UNIQUE index on
  // categories(name), predating multi-user support and superseded by the
  // (user_id, name) composite index above. It silently blocks every user but
  // the first from ever creating a category whose name the first user already used.
  db.prepare('PRAGMA index_list(categories)').all().forEach((index) => {
    // Auto-generated indexes for an inline column constraint (e.g. sqlite_autoindex_*)
    // can't be dropped directly - only Case 2 below (table rebuild) can remove those.
    if (!index.unique || index.name.startsWith('sqlite_autoindex_')) return;
    const columns = db.prepare(`PRAGMA index_info("${index.name}")`).all();
    if (columns.length === 1 && columns[0].name === 'name') {
      db.exec(`DROP INDEX IF EXISTS "${index.name}"`);
    }
  });

  // Older installations may also have that same UNIQUE constraint embedded
  // directly in the table definition itself (from before user_id existed),
  // which a DROP INDEX can't remove — only a table rebuild can.
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'categories'").get();
  if (!row?.sql || !/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql)) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE categories_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2f80ed',
      description TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO categories_new (id, user_id, name, color, description, sort_order, created_at, updated_at)
    SELECT id, user_id, name, color, description, sort_order, created_at, updated_at FROM categories;
    DROP TABLE categories;
    ALTER TABLE categories_new RENAME TO categories;
    PRAGMA foreign_keys = ON;
  `);
}

function backfillMissingCategoriesForExistingUsers() {
  // A user whose registration ran while the stale global UNIQUE constraint
  // above was still active would have had every default category silently
  // dropped by INSERT OR IGNORE (the name was already taken by an earlier
  // user). Give any user with zero categories the same defaults now.
  const users = db.prepare('SELECT id FROM users').all();
  const countForUser = db.prepare('SELECT COUNT(*) AS count FROM categories WHERE user_id = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO categories (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)');
  users.forEach((user) => {
    if ((countForUser.get(user.id)?.count || 0) > 0) return;
    insert.run(user.id, 'משימות אישיות', '#2f80ed', 1);
    insert.run(user.id, 'סידורים', '#12a594', 2);
    insert.run(user.id, 'משפחה', '#ef5350', 3);
    insert.run(user.id, 'פיתוח עסקי', '#8b5cf6', 4);
    insert.run(user.id, 'קניות', '#f59e0b', 5);
  });
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
  const setting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setting.run('theme', 'light');
  setting.run('language', 'he');
}

function seedPriorities() {
  const insertPriority = db.prepare(`
    INSERT OR IGNORE INTO priorities (key, name, color, sort_order, is_default)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertPriority.run('low', '\u05e0\u05de\u05d5\u05db\u05d4', '#22c55e', 1, 1);
  insertPriority.run('medium', '\u05d1\u05d9\u05e0\u05d5\u05e0\u05d9\u05ea', '#2f80ed', 2, 1);
  insertPriority.run('high', '\u05d2\u05d1\u05d5\u05d4\u05d4', '#f59e0b', 3, 1);
  insertPriority.run('urgent', '\u05d3\u05d7\u05d5\u05e4\u05d4', '#ef5350', 4, 1);
}

function getCategoryId(name) {

  return db.prepare('SELECT id FROM categories WHERE name = ?').get(name)?.id || null;
}

function getDb() {
  if (!db) throw new Error('Database was not initialized');
  return db;
}

module.exports = { initDatabase, getDb };


