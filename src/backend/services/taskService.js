const { validateTask } = require('../validators/taskValidator');

class TaskService {
  constructor(taskRepository, statusRepository) {
    this.tasks = taskRepository;
    this.statuses = statusRepository;
  }

  list(userId, filters) {
    return this.tasks.list(userId, filters);
  }

  create(userId, payload) {
    return this.tasks.create({ ...this.normalize(userId, payload), user_id: Number(userId) });
  }

  update(userId, id, payload) {
    return this.tasks.update(userId, id, this.normalize(userId, payload));
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

  normalize(userId, payload) {
    const statusRows = this.statuses.list(userId);
    const validation = validateTask(payload, statusRows.map((row) => row.key));
    if (!validation.valid) {
      const error = new Error('Validation failed');
      error.status = 422;
      error.details = validation.errors;
      throw error;
    }
    const defaultStatus = statusRows.find((row) => !row.is_done)?.key || statusRows[0]?.key || 'open';
    const status = payload.status || defaultStatus;
    const statusMeta = statusRows.find((row) => row.key === status);
    const isDone = statusMeta ? Boolean(statusMeta.is_done) : status === 'completed';
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
      completed_at: isDone ? (payload.completed_at || new Date().toISOString()) : null,
      tags: Array.isArray(payload.tags) ? payload.tags : String(payload.tags || '').split(',')
    };
  }
}

module.exports = TaskService;

