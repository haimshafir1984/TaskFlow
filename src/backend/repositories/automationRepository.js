function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

class AutomationRepository {
  constructor(db) { this.db = db; }

  listRules(userId) {
    return this.db.prepare(`SELECT r.*, i.name AS integration_name, i.provider FROM automation_rules r LEFT JOIN integrations i ON i.id = r.integration_id WHERE r.user_id = ? ORDER BY r.name`).all(Number(userId)).map((row) => ({ ...row, conditions: parseJson(row.conditions), action_config: parseJson(row.action_config), is_active: Boolean(row.is_active) }));
  }

  findRule(userId, id) {
    const row = this.db.prepare('SELECT * FROM automation_rules WHERE id = ? AND user_id = ?').get(Number(id), Number(userId));
    return row ? { ...row, conditions: parseJson(row.conditions), action_config: parseJson(row.action_config), is_active: Boolean(row.is_active) } : null;
  }

  create(data) {
    const result = this.db.prepare(`INSERT INTO automation_rules (user_id, integration_id, name, trigger_type, conditions, action_type, action_config, is_active) VALUES (@user_id, @integration_id, @name, @trigger_type, @conditions, @action_type, @action_config, @is_active)`).run({ ...data, conditions: JSON.stringify(data.conditions || {}), action_config: JSON.stringify(data.action_config || {}), is_active: data.is_active === false ? 0 : 1 });
    return this.findRule(data.user_id, result.lastInsertRowid);
  }

  update(userId, id, data) {
    this.db.prepare(`UPDATE automation_rules SET integration_id = @integration_id, name = @name, trigger_type = @trigger_type, conditions = @conditions, action_type = @action_type, action_config = @action_config, is_active = @is_active, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND user_id = @user_id`).run({ ...data, id: Number(id), user_id: Number(userId), conditions: JSON.stringify(data.conditions || {}), action_config: JSON.stringify(data.action_config || {}), is_active: data.is_active === false ? 0 : 1 });
    return this.findRule(userId, id);
  }

  deleteForUser(userId, id) { return this.db.prepare('DELETE FROM automation_rules WHERE id = ? AND user_id = ?').run(Number(id), Number(userId)); }

  addLog(data) {
    const result = this.db.prepare(`INSERT INTO automation_logs (user_id, rule_id, integration_id, event_type, status, request_payload) VALUES (@user_id, @rule_id, @integration_id, @event_type, @status, @request_payload)`).run({ ...data, status: data.status || 'pending', request_payload: JSON.stringify(data.request_payload || {}) });
    return result.lastInsertRowid;
  }

  finishLog(id, status, responseStatus = null, errorMessage = null) {
    this.db.prepare('UPDATE automation_logs SET status = ?, response_status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, responseStatus, errorMessage, Number(id));
  }

  listLogs(userId, limit = 50) {
    return this.db.prepare(`SELECT l.*, r.name AS rule_name, i.name AS integration_name FROM automation_logs l LEFT JOIN automation_rules r ON r.id = l.rule_id LEFT JOIN integrations i ON i.id = l.integration_id WHERE l.user_id = ? ORDER BY l.id DESC LIMIT ?`).all(Number(userId), Math.min(Number(limit) || 50, 200)).map((row) => ({ ...row, request_payload: parseJson(row.request_payload) }));
  }
}

module.exports = AutomationRepository;
