const { validateTask } = require('../validators/taskValidator');

class TaskService {
  constructor(taskRepository) {
    this.tasks = taskRepository;
  }

  list(userId, filters) {
    return this.tasks.list(userId, filters);
  }

  create(userId, payload) {
    return this.tasks.create({ ...this.normalize(payload), user_id: Number(userId) });
  }

  update(userId, id, payload) {
    return this.tasks.update(userId, id, this.normalize(payload));
  }

  delete(userId, id) {
    return this.tasks.deleteForUser(userId, id);
  }

  complete(userId, id) {
    return this.tasks.markComplete(userId, id);
  }

  duplicate(userId, id) {
    return this.tasks.duplicate(userId, id);
  }

  dashboard(userId) {
    return this.tasks.dashboard(userId);
  }

  normalize(payload) {
    const validation = validateTask(payload);
    if (!validation.valid) {
      const error = new Error('Validation failed');
      error.status = 422;
      error.details = validation.errors;
      throw error;
    }
    const status = payload.status || 'open';
    return {
      name: String(payload.name).trim(),
      description: payload.description || '',
      project_id: payload.project_id ? Number(payload.project_id) : null,
      category_id: payload.category_id ? Number(payload.category_id) : null,
      contact_id: payload.contact_id ? Number(payload.contact_id) : null,
      priority: payload.priority || 'medium',
      status,
      created_at: payload.created_at || new Date().toISOString(),
      due_date: payload.due_date || null,
      notes: payload.notes || '',
      completed_at: status === 'completed' ? payload.completed_at || new Date().toISOString() : null,
      tags: Array.isArray(payload.tags) ? payload.tags : String(payload.tags || '').split(',')
    };
  }
}

module.exports = TaskService;

