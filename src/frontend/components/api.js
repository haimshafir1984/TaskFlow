window.Api = {
  token: localStorage.getItem('taskflow_token') || '',

  setToken(token) {
    Api.token = token || '';
    if (token) localStorage.setItem('taskflow_token', token);
    else localStorage.removeItem('taskflow_token');
  },

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (Api.token) headers.Authorization = `Bearer ${Api.token}`;
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      const isAuthFormRequest = path === '/auth/login' || path === '/auth/register' || path === '/auth/status';
      if (!isAuthFormRequest) {
        Api.setToken('');
        window.dispatchEvent(new CustomEvent('taskflow:auth-required'));
      }
      const error = new Error(data.message || 'Authentication required');
      error.code = data.code;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(data.message || 'API error');
      error.code = data.code;
      throw error;
    }
    return data;
  },

  register: (username, password) => Api.request('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) => Api.request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => Api.request('/auth/logout', { method: 'POST' }),
  authStatus: () => Api.request('/auth/status'),
  changePassword: (currentPassword, nextPassword) => Api.request('/auth/change-password', { method: 'POST', body: { currentPassword, nextPassword } }),
  dashboard: () => Api.request('/dashboard'),
  tasks: (query = '') => Api.request(`/tasks${query}`),
  createTask: (body) => Api.request('/tasks', { method: 'POST', body }),
  updateTask: (id, body) => Api.request(`/tasks/${id}`, { method: 'PUT', body }),
  deleteTask: (id) => Api.request(`/tasks/${id}`, { method: 'DELETE' }),
  completeTask: (id) => Api.request(`/tasks/${id}/complete`, { method: 'POST' }),
  duplicateTask: (id) => Api.request(`/tasks/${id}/duplicate`, { method: 'POST' }),
  priorities: () => Api.request('/priorities'),
  createPriority: (body) => Api.request('/priorities', { method: 'POST', body }),
  updatePriority: (id, body) => Api.request(`/priorities/${id}`, { method: 'PUT', body }),
  deletePriority: (id) => Api.request(`/priorities/${id}`, { method: 'DELETE' }),
  categories: () => Api.request('/categories'),
  createCategory: (body) => Api.request('/categories', { method: 'POST', body }),
  updateCategory: (id, body) => Api.request(`/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id) => Api.request(`/categories/${id}`, { method: 'DELETE' }),
  projects: () => Api.request('/projects'),
  createProject: (body) => Api.request('/projects', { method: 'POST', body }),
  updateProject: (id, body) => Api.request(`/projects/${id}`, { method: 'PUT', body }),
  deleteProject: (id) => Api.request(`/projects/${id}`, { method: 'DELETE' }),
  customers: () => Api.request('/customers'),
  createCustomer: (body) => Api.request('/customers', { method: 'POST', body }),
  updateCustomer: (id, body) => Api.request(`/customers/${id}`, { method: 'PUT', body }),
  deleteCustomer: (id) => Api.request(`/customers/${id}`, { method: 'DELETE' }),
  contacts: () => Api.request('/contacts'),
  createContact: (body) => Api.request('/contacts', { method: 'POST', body }),
  updateContact: (id, body) => Api.request(`/contacts/${id}`, { method: 'PUT', body }),
  deleteContact: (id) => Api.request(`/contacts/${id}`, { method: 'DELETE' }),
  statuses: () => Api.request('/statuses'),
  createStatus: (body) => Api.request('/statuses', { method: 'POST', body }),
  updateStatus: (id, body) => Api.request(`/statuses/${id}`, { method: 'PUT', body }),
  deleteStatus: (id) => Api.request(`/statuses/${id}`, { method: 'DELETE' }),
  preferences: () => Api.request('/preferences'),
  setPreferences: (body) => Api.request('/preferences', { method: 'PUT', body }),
  settings: () => Api.request('/settings'),
  setSetting: (key, value) => Api.request('/settings', { method: 'POST', body: { key, value } }),
  backup: (destination) => Api.request('/settings/backup', { method: 'POST', body: { destination } }),
  restore: (source) => Api.request('/settings/restore', { method: 'POST', body: { source } }),
  exportCsv: (destination) => Api.request('/settings/export-csv', { method: 'POST', body: { destination } }),
  importCsv: (source) => Api.request('/settings/import-csv', { method: 'POST', body: { source } })
};
