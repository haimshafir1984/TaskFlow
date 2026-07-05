const BaseRepository = require('./baseRepository');

class CategoryRepository extends BaseRepository {
  constructor(db) {
    super(db, 'categories');
  }

  list() {
    return this.db.prepare(`
      SELECT c.*,
             COUNT(DISTINCT t.id) AS task_count,
             COUNT(DISTINCT p.id) AS project_count
      FROM categories c
      LEFT JOIN tasks t ON t.category_id = c.id
      LEFT JOIN projects p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name COLLATE NOCASE
    `).all();
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO categories (name, color, description, sort_order)
      VALUES (@name, @color, @description, @sort_order)
    `).run(data);
    return this.findById(info.lastInsertRowid);
  }

  update(id, data) {
    this.db.prepare(`
      UPDATE categories
      SET name = @name,
          color = @color,
          description = @description,
          sort_order = @sort_order,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id });
    return this.findById(id);
  }
}

module.exports = CategoryRepository;
