const crypto = require('crypto');

const TRIGGERS = new Set(['task.created', 'task.updated', 'task.completed', 'customer.created', 'customer.closed']);
const PROVIDERS = new Set(['make', 'power_automate', 'google_sheets', 'webhook']);

class AutomationService {
  constructor(integrationRepository, automationRepository, taskRepository) {
    this.integrations = integrationRepository;
    this.automations = automationRepository;
    this.tasks = taskRepository;
  }

  listIntegrations(userId) { return this.integrations.list(userId); }

  createIntegration(userId, payload) {
    const normalized = this.normalizeIntegration(userId, payload);
    return publicIntegration(this.integrations.create(normalized));
  }

  updateIntegration(userId, id, payload) {
    return publicIntegration(this.integrations.update(userId, id, this.normalizeIntegration(userId, payload)));
  }

  deleteIntegration(userId, id) { return this.integrations.deleteForUser(userId, id); }

  listRules(userId) { return this.automations.listRules(userId); }

  createRule(userId, payload) {
    const normalized = this.normalizeRule(userId, payload);
    this.assertIntegration(userId, normalized.integration_id);
    return this.automations.create(normalized);
  }

  updateRule(userId, id, payload) {
    const normalized = this.normalizeRule(userId, payload);
    this.assertIntegration(userId, normalized.integration_id);
    return this.automations.update(userId, id, normalized);
  }

  deleteRule(userId, id) { return this.automations.deleteForUser(userId, id); }

  logs(userId, limit) { return this.automations.listLogs(userId, limit); }

  createIncomingKey(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const integration = this.integrations.create({ user_id: Number(userId), provider: 'webhook', name: 'Webhook נכנס', auth_type: 'incoming_webhook', config: { direction: 'incoming' }, credentials: { token } });
    return { id: integration.id, token };
  }

  receiveIncoming(token, payload) {
    const row = this.findIncoming(token);
    if (!row) { const error = new Error('Invalid incoming webhook token'); error.status = 401; error.code = 'INVALID_WEBHOOK_TOKEN'; throw error; }
    if (!payload || !String(payload.name || '').trim()) { const error = new Error('Task name is required'); error.status = 422; error.code = 'INVALID_TASK_PAYLOAD'; throw error; }
    return { userId: row.user_id, task: payload };
  }

  findIncoming(token) {
    const rows = this.integrations.db.prepare("SELECT * FROM integrations WHERE provider = 'webhook' AND auth_type = 'incoming_webhook' AND is_active = 1").all();
    return rows.find((row) => {
      try { return crypto.timingSafeEqual(Buffer.from(JSON.parse(row.credentials || '{}').token || ''), Buffer.from(String(token))); } catch { return false; }
    });
  }

  emit(userId, eventType, payload) {
    if (!TRIGGERS.has(eventType)) return;
    const rules = this.automations.listRules(userId).filter((rule) => rule.is_active && rule.trigger_type === eventType && matchesConditions(rule.conditions, payload));
    rules.forEach((rule) => this.dispatchRule(userId, rule, eventType, payload));
  }

  dispatchRule(userId, rule, eventType, payload) {
    const integration = this.integrations.findForUser(userId, rule.integration_id);
    if (!integration || !integration.is_active) return;
    const url = integration.config?.webhook_url || integration.config?.url;
    if (!url || !/^https:\/\//i.test(url)) {
      const logId = this.automations.addLog({ user_id: userId, rule_id: rule.id, integration_id: integration.id, event_type: eventType, status: 'failed', request_payload: payload });
      this.automations.finishLog(logId, 'failed', null, 'Integration requires an HTTPS webhook URL');
      this.integrations.markResult(integration.id, false, 'Integration requires an HTTPS webhook URL');
      return;
    }
    const logId = this.automations.addLog({ user_id: userId, rule_id: rule.id, integration_id: integration.id, event_type: eventType, request_payload: payload });
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TaskFlow-Event': eventType }, body: JSON.stringify({ event: eventType, data: payload }) })
      .then((response) => {
        if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
        this.automations.finishLog(logId, 'success', response.status);
        this.integrations.markResult(integration.id, true, null);
      })
      .catch((error) => {
        this.automations.finishLog(logId, 'failed', null, error.message);
        this.integrations.markResult(integration.id, false, error.message);
      });
  }

  normalizeIntegration(userId, payload) {
    const provider = String(payload.provider || 'webhook').trim();
    if (!PROVIDERS.has(provider)) { const error = new Error('Unsupported integration provider'); error.status = 422; throw error; }
    const name = String(payload.name || '').trim();
    if (!name) { const error = new Error('Integration name is required'); error.status = 422; throw error; }
    return { user_id: Number(userId), provider, name, auth_type: payload.auth_type || 'webhook', config: payload.config || {}, credentials: payload.credentials || {}, is_active: payload.is_active !== false };
  }

  normalizeRule(userId, payload) {
    const trigger_type = String(payload.trigger_type || '').trim();
    if (!TRIGGERS.has(trigger_type)) { const error = new Error('Unsupported automation trigger'); error.status = 422; throw error; }
    const name = String(payload.name || '').trim();
    if (!name) { const error = new Error('Automation name is required'); error.status = 422; throw error; }
    return { user_id: Number(userId), integration_id: payload.integration_id ? Number(payload.integration_id) : null, name, trigger_type, conditions: payload.conditions || {}, action_type: payload.action_type || 'send_event', action_config: payload.action_config || {}, is_active: payload.is_active !== false };
  }

  assertIntegration(userId, id) {
    if (id && !this.integrations.findForUser(userId, id)) { const error = new Error('Integration not found'); error.status = 404; throw error; }
  }
}

function matchesConditions(conditions, payload) {
  return Object.entries(conditions || {}).every(([key, value]) => String(payload[key] ?? '') === String(value));
}

function publicIntegration(integration) {
  if (!integration) return integration;
  const { credentials, ...safe } = integration;
  return safe;
}

module.exports = AutomationService;
