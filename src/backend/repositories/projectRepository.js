const BaseRepository = require('./baseRepository');

class ProjectRepository extends BaseRepository {
  constructor(db) {
    super(db, 'projects');
  }

  list() {
    return this.db.prepare(`
      SELECT p.*,
             c.name AS category_name,
             c.color AS category_color,
             COUNT(t.id) AS task_count
      FROM projects p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY c.sort_order ASC, p.name COLLATE NOCASE
    `).all();
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO projects (name, category_id, color, description)
      VALUES (@name, @category_id, @color, @description)
    `).run(data);
    return this.findById(info.lastInsertRowid);
  }

  update(id, data) {
    this.db.prepare(`
      UPDATE projects
      SET name = @name,
          category_id = @category_id,
          color = @color,
          description = @description,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id });
    return this.findById(id);
  }
}

module.exports = ProjectRepository;
