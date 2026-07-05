const BaseRepository = require('./baseRepository');

class PriorityRepository extends BaseRepository {
  constructor(db) {
    super(db, 'priorities');
  }

  list() {
    return this.db.prepare(`
      SELECT p.*, COUNT(t.id) AS task_count
      FROM priorities p
      LEFT JOIN tasks t ON t.priority = p.key
      GROUP BY p.id
      ORDER BY p.sort_order ASC, p.name COLLATE NOCASE
    `).all();
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO priorities (key, name, color, sort_order, is_default)
      VALUES (@key, @name, @color, @sort_order, 0)
    `).run(data);
    return this.findById(info.lastInsertRowid);
  }

  update(id, data) {
    const current = this.findById(id);
    if (!current) return null;
    this.db.prepare(`
      UPDATE priorities
      SET key = @key,
          name = @name,
          color = @color,
          sort_order = @sort_order,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id });
    if (current.key !== data.key) {
      this.db.prepare('UPDATE tasks SET priority = ? WHERE priority = ?').run(data.key, current.key);
    }
    return this.findById(id);
  }

  delete(id) {
    const current = this.findById(id);
    if (!current) return null;
    const fallback = this.db.prepare('SELECT key FROM priorities WHERE id != ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(id);
    if (fallback) {
      this.db.prepare('UPDATE tasks SET priority = ? WHERE priority = ?').run(fallback.key, current.key);
    }
    return super.delete(id);
  }
}

module.exports = PriorityRepository;
