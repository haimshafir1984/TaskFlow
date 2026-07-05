const BaseRepository = require('./baseRepository');

class PriorityRepository extends BaseRepository {
  constructor(db) {
    super(db, 'priorities');
  }

  list(userId) {
    return this.db.prepare(`
      SELECT p.*, COUNT(t.id) AS task_count
      FROM priorities p
      LEFT JOIN tasks t ON t.priority = p.key AND t.user_id = p.user_id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.sort_order ASC, p.name COLLATE NOCASE
    `).all(Number(userId));
  }

  findByIdForUser(userId, id) {
    return this.db.prepare('SELECT * FROM priorities WHERE id = ? AND user_id = ?').get(id, Number(userId));
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO priorities (user_id, key, name, color, sort_order, is_default)
      VALUES (@user_id, @key, @name, @color, @sort_order, 0)
    `).run(data);
    return this.findByIdForUser(data.user_id, info.lastInsertRowid);
  }

  update(userId, id, data) {
    const current = this.findByIdForUser(userId, id);
    if (!current) return null;
    this.db.prepare(`
      UPDATE priorities
      SET key = @key,
          name = @name,
          color = @color,
          sort_order = @sort_order,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @user_id
    `).run({ ...data, id, user_id: Number(userId) });
    if (current.key !== data.key) {
      this.db.prepare('UPDATE tasks SET priority = ? WHERE priority = ? AND user_id = ?').run(data.key, current.key, Number(userId));
    }
    return this.findByIdForUser(userId, id);
  }

  deleteForUser(userId, id) {
    const current = this.findByIdForUser(userId, id);
    if (!current) return null;
    const fallback = this.db.prepare('SELECT key FROM priorities WHERE id != ? AND user_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(id, Number(userId));
    if (fallback) {
      this.db.prepare('UPDATE tasks SET priority = ? WHERE priority = ? AND user_id = ?').run(fallback.key, current.key, Number(userId));
    }
    return this.db.prepare('DELETE FROM priorities WHERE id = ? AND user_id = ?').run(id, Number(userId));
  }
}

module.exports = PriorityRepository;
