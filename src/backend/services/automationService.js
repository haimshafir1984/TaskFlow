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
    const existing = this.integrations.findForUser(userId, id);
    if (!existing) { const error = new Error('Integration not found'); error.status = 404; throw error; }
    const normalized = this.normalizeIntegration(userId, { ...existing, ...payload, credentials: payload.credentials || existing.credentials });
    return publicIntegration(this.integrations.update(userId, id, normalized));
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

  googleAuthorize(userId) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) { const error = new Error('Google OAuth is not configured on the server'); error.status = 503; error.code = 'GOOGLE_NOT_CONFIGURED'; throw error; }
    const state = crypto.randomBytes(24).toString('hex');
    this.integrations.db.prepare('INSERT INTO oauth_states (state, user_id, provider, expires_at) VALUES (?, ?, ?, datetime(\'now\', \'+10 minutes\'))').run(state, Number(userId), 'google_sheets');
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets', state });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async googleCallback(code, state) {
    const oauthState = this.integrations.db.prepare("SELECT * FROM oauth_states WHERE state = ? AND provider = 'google_sheets' AND datetime(expires_at) > datetime('now')").get(state);
    if (!oauthState) { const error = new Error('Google authorization expired or invalid'); error.status = 400; throw error; }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    const token = await response.json();
    if (!response.ok || !token.access_token) { const error = new Error(token.error_description || 'Google authorization failed'); error.status = 502; throw error; }
    const credentials = { access_token: token.access_token, refresh_token: token.refresh_token || '', expires_at: Date.now() + Number(token.expires_in || 3600) * 1000 };
    const existing = this.integrations.db.prepare("SELECT id FROM integrations WHERE user_id = ? AND provider = 'google_sheets' ORDER BY id LIMIT 1").get(oauthState.user_id);
    if (existing) this.integrations.update(oauthState.user_id, existing.id, { provider: 'google_sheets', name: 'Google Sheets', auth_type: 'oauth2', config: {}, credentials, is_active: true });
    else this.integrations.create({ user_id: oauthState.user_id, provider: 'google_sheets', name: 'Google Sheets', auth_type: 'oauth2', config: {}, credentials, is_active: true });
    this.integrations.db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    return oauthState.user_id;
  }

  async googleSpreadsheets(userId) {
    const integration = this.findProvider(userId, 'google_sheets');
    if (!integration) { const error = new Error('Google account is not connected'); error.status = 404; throw error; }
    const response = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'+and+trashed=false&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc", { headers: { Authorization: `Bearer ${integration.credentials.access_token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Unable to list Google Sheets');
    return data.files || [];
  }

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
    if (integration.provider === 'google_sheets') {
      this.dispatchGoogleRow(userId, rule, integration, eventType, payload);
      return;
    }
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

  dispatchGoogleRow(userId, rule, integration, eventType, payload) {
    const spreadsheetId = rule.action_config?.spreadsheet_id || integration.config?.spreadsheet_id;
    const sheetName = rule.action_config?.sheet_name || integration.config?.sheet_name || 'Sheet1';
    if (!spreadsheetId) {
      const logId = this.automations.addLog({ user_id: userId, rule_id: rule.id, integration_id: integration.id, event_type: eventType, status: 'failed', request_payload: payload });
      this.automations.finishLog(logId, 'failed', null, 'Google spreadsheet is not selected');
      return;
    }
    const logId = this.automations.addLog({ user_id: userId, rule_id: rule.id, integration_id: integration.id, event_type: eventType, request_payload: payload });
    const row = [payload.name || '', payload.category_name || '', payload.priority || '', payload.status || '', payload.due_date || '', payload.created_at || ''];
    const range = encodeURIComponent(`${sheetName}!A:F`);
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: { Authorization: `Bearer ${integration.credentials.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) })
      .then(async (response) => { if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error?.message || `Google Sheets returned HTTP ${response.status}`); } this.automations.finishLog(logId, 'success', response.status); this.integrations.markResult(integration.id, true, null); })
      .catch((error) => { this.automations.finishLog(logId, 'failed', null, error.message); this.integrations.markResult(integration.id, false, error.message); });
  }

  findProvider(userId, provider) {
    const row = this.integrations.db.prepare('SELECT * FROM integrations WHERE user_id = ? AND provider = ? AND is_active = 1 ORDER BY id LIMIT 1').get(Number(userId), provider);
    return row ? { ...row, config: JSON.parse(row.config || '{}'), credentials: JSON.parse(row.credentials || '{}'), is_active: Boolean(row.is_active) } : null;
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
