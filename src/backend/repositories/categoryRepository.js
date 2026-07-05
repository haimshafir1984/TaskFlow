const BaseRepository = require('./baseRepository');

class CategoryRepository extends BaseRepository {
  constructor(db) {
    super(db, 'categories');
  }

  list(userId) {
    return this.db.prepare(`
      SELECT c.*,
             COUNT(DISTINCT t.id) AS task_count,
             COUNT(DISTINCT p.id) AS project_count
      FROM categories c
      LEFT JOIN tasks t ON t.category_id = c.id AND t.user_id = c.user_id
      LEFT JOIN projects p ON p.category_id = c.id AND p.user_id = c.user_id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name COLLATE NOCASE
    `).all(Number(userId));
  }

  findByIdForUser(userId, id) {
    return this.db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, Number(userId));
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO categories (user_id, name, color, description, sort_order)
      VALUES (@user_id, @name, @color, @description, @sort_order)
    `).run(data);
    return this.findByIdForUser(data.user_id, info.lastInsertRowid);
  }

  update(userId, id, data) {
    this.db.prepare(`
      UPDATE categories
      SET name = @name,
          color = @color,
          description = @description,
          sort_order = @sort_order,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @user_id
    `).run({ ...data, id, user_id: Number(userId) });
    return this.findByIdForUser(userId, id);
  }

  deleteForUser(userId, id) {
    return this.db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, Number(userId));
  }
}

module.exports = CategoryRepository;
