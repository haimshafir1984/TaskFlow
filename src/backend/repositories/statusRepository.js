const BaseRepository = require('./baseRepository');

class StatusRepository extends BaseRepository {
  constructor(db) {
    super(db, 'statuses');
  }

  list(userId) {
    return this.db.prepare(`
      SELECT s.*, COUNT(t.id) AS task_count
      FROM statuses s
      LEFT JOIN tasks t ON t.status = s.key AND t.user_id = s.user_id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.sort_order ASC, s.name COLLATE NOCASE
    `).all(Number(userId));
  }

  findByIdForUser(userId, id) {
    return this.db.prepare('SELECT * FROM statuses WHERE id = ? AND user_id = ?').get(id, Number(userId));
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO statuses (user_id, key, name, color, sort_order, is_done)
      VALUES (@user_id, @key, @name, @color, @sort_order, @is_done)
    `).run(data);
    return this.findByIdForUser(data.user_id, info.lastInsertRowid);
  }

  update(userId, id, data) {
    const current = this.findByIdForUser(userId, id);
    if (!current) return null;
    this.db.prepare(`
      UPDATE statuses
      SET key = @key,
          name = @name,
          color = @color,
          sort_order = @sort_order,
          is_done = @is_done,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @user_id
    `).run({ ...data, id, user_id: Number(userId) });
    if (current.key !== data.key) {
      this.db.prepare('UPDATE tasks SET status = ? WHERE status = ? AND user_id = ?').run(data.key, current.key, Number(userId));
    }
    return this.findByIdForUser(userId, id);
  }

  deleteForUser(userId, id) {
    const current = this.findByIdForUser(userId, id);
    if (!current) return null;
    const fallback = this.db.prepare('SELECT key FROM statuses WHERE id != ? AND user_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(id, Number(userId));
    if (fallback) {
      this.db.prepare('UPDATE tasks SET status = ? WHERE status = ? AND user_id = ?').run(fallback.key, current.key, Number(userId));
    }
    return this.db.prepare('DELETE FROM statuses WHERE id = ? AND user_id = ?').run(id, Number(userId));
  }

  defaultDoneKey(userId) {
    return this.db.prepare('SELECT key FROM statuses WHERE user_id = ? AND is_done = 1 ORDER BY sort_order ASC LIMIT 1').get(Number(userId))?.key || 'completed';
  }

  defaultOpenKey(userId) {
    return this.db.prepare('SELECT key FROM statuses WHERE user_id = ? AND is_done = 0 ORDER BY sort_order ASC LIMIT 1').get(Number(userId))?.key || 'open';
  }
}

module.exports = StatusRepository;
