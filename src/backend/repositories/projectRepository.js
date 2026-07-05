const BaseRepository = require('./baseRepository');

class ProjectRepository extends BaseRepository {
  constructor(db) {
    super(db, 'projects');
  }

  list(userId) {
    return this.db.prepare(`
      SELECT p.*,
             c.name AS category_name,
             c.color AS category_color,
             COUNT(t.id) AS task_count
      FROM projects p
      LEFT JOIN categories c ON c.id = p.category_id AND c.user_id = p.user_id
      LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY c.sort_order ASC, p.name COLLATE NOCASE
    `).all(Number(userId));
  }

  findByIdForUser(userId, id) {
    return this.db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, Number(userId));
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO projects (user_id, name, category_id, color, description)
      VALUES (@user_id, @name, @category_id, @color, @description)
    `).run(data);
    return this.findByIdForUser(data.user_id, info.lastInsertRowid);
  }

  update(userId, id, data) {
    this.db.prepare(`
      UPDATE projects
      SET name = @name,
          category_id = @category_id,
          color = @color,
          description = @description,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @user_id
    `).run({ ...data, id, user_id: Number(userId) });
    return this.findByIdForUser(userId, id);
  }

  deleteForUser(userId, id) {
    return this.db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, Number(userId));
  }
}

module.exports = ProjectRepository;
