const fs = require('fs');

class SettingsService {
  constructor(db, dbPath) {
    this.db = db;
    this.dbPath = dbPath;
  }

  all() {
    return Object.fromEntries(this.db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
  }

  set(key, value) {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(value));
    return this.all();
  }

  backup(destination) {
    fs.copyFileSync(this.dbPath, destination);
    return { ok: true, path: destination };
  }

  restore(source) {
    fs.copyFileSync(source, this.dbPath);
    return { ok: true };
  }

  exportCsv(tasks, destination) {
    const headers = ['id', 'name', 'description', 'project_name', 'contact_name', 'priority', 'status', 'created_at', 'due_date', 'tags', 'notes'];
    const rows = tasks.map((task) => headers.map((key) => escapeCsv(task[key] ?? '')).join(','));
    fs.writeFileSync(destination, [headers.join(','), ...rows].join('\n'), 'utf8');
    return { ok: true, path: destination };
  }

  importCsv(source, taskService) {
    const text = fs.readFileSync(source, 'utf8');
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(headerLine || '');
    const imported = lines.reduce((count, line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
      if (!row.name) return count;
      taskService.create({
        name: row.name,
        description: row.description,
        priority: row.priority || 'medium',
        status: row.status || 'open',
        created_at: row.created_at,
        due_date: row.due_date,
        tags: row.tags,
        notes: row.notes
      });
      return count + 1;
    }, 0);
    return { ok: true, imported };
  }
}

function escapeCsv(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

module.exports = SettingsService;
