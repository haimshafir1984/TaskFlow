const t = window.I18N;

const TASK_COLUMNS = ['status', 'priority', 'name', 'category', 'project', 'contact', 'due_date', 'created_at', 'actions'];
const DEFAULT_TASK_COLUMNS = ['status', 'priority', 'name', 'category', 'project', 'contact', 'due_date', 'created_at', 'actions'];
const SORT_FIELDS = ['priority', 'created_at', 'due_date', 'project', 'category'];
const DASHBOARD_CARD_WIDGETS = ['open_tasks', 'completed_tasks', 'overdue_tasks', 'today_tasks'];
const DASHBOARD_PANEL_WIDGETS = ['byPriority', 'byCategory', 'byProject', 'recent'];
const NAV_KEYS = ['dashboard', 'tasks', 'customers', 'categories', 'projects', 'contacts', 'settings'];
const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const UNDO_WINDOW_MS = 5000;
const MOBILE_BREAKPOINT = '(max-width: 760px)';

const state = {
  view: 'tasks',
  tasks: [],
  projects: [],
  categories: [],
  priorities: [],
  statuses: [],
  contacts: [],
  customers: [],
  settings: {},
  prefs: defaultPreferences(),
  filters: { status: 'active', sort_by: 'created_at', sort_dir: 'desc' },
  visibleTaskColumns: [...DEFAULT_TASK_COLUMNS],
  dashboardWidgets: {},
  showColumnPicker: false,
  editingTask: null,
  editingCells: new Set(),
  selectedTaskIds: new Set()
};

let pendingDelete = null;
let pendingComplete = null;
let lastFocusedElement = null;

function defaultPreferences() {
  return {
    taskFilters: { status: 'active', sort_by: 'created_at', sort_dir: 'desc' },
    visibleTaskColumns: [...DEFAULT_TASK_COLUMNS],
    taskColumnOrder: [...TASK_COLUMNS],
    dashboardWidgets: Object.fromEntries([...DASHBOARD_CARD_WIDGETS, ...DASHBOARD_PANEL_WIDGETS].map((key) => [key, true])),
    dashboardPanelOrder: [...DASHBOARD_PANEL_WIDGETS],
    dashboardWidgetSize: {},
    savedViews: [],
    density: 'normal',
    fontSize: 'normal',
    homeView: 'tasks',
    sidebarOrder: [...NAV_KEYS],
    sidebarHidden: []
  };
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindGlobalShortcuts();
  bindGlobalUiHandlers();
  window.addEventListener('taskflow:auth-required', () => renderLogin());
  if (!Api.token) return renderLogin();
  try {
    const status = await Api.authStatus();
    if (!status.authenticated) return renderLogin(status);
  } catch (error) {
    return renderLogin();
  }
  renderShell();
  await loadPreferences();
  state.view = state.prefs.homeView || 'tasks';
  await loadAll();
  renderView();
  handleQuickAddShortcutParam();
}

function handleQuickAddShortcutParam() {
  if (new URLSearchParams(location.search).get('quick-add') !== '1') return;
  if (window.matchMedia(MOBILE_BREAKPOINT).matches) openQuickAddSheet();
  else document.getElementById('quick-add-input')?.focus();
}

async function loadPreferences() {
  const defaults = defaultPreferences();
  let remote = null;
  try { remote = await Api.preferences(); } catch (error) { remote = null; }
  if (remote && Object.keys(remote).length) {
    state.prefs = { ...defaults, ...remote };
  } else {
    const legacy = migrateLegacyPreferences();
    state.prefs = { ...defaults, ...(legacy || {}) };
    if (legacy) persistPreferences();
  }
  writeLocalPrefsCache(state.prefs);
  state.filters = { ...defaults.taskFilters, ...(state.prefs.taskFilters || {}) };
  state.visibleTaskColumns = state.prefs.visibleTaskColumns?.length ? state.prefs.visibleTaskColumns : defaults.visibleTaskColumns;
  state.dashboardWidgets = { ...defaults.dashboardWidgets, ...(state.prefs.dashboardWidgets || {}) };
  applyPreferenceStyles();
}

function migrateLegacyPreferences() {
  const result = {};
  try {
    const cols = JSON.parse(localStorage.getItem('taskflow_task_columns') || 'null');
    if (Array.isArray(cols) && cols.length) result.visibleTaskColumns = cols.filter((c) => TASK_COLUMNS.includes(c));
  } catch (error) { /* ignore malformed cache */ }
  try {
    const filters = JSON.parse(localStorage.getItem('taskflow_task_filters') || 'null');
    if (filters && typeof filters === 'object') result.taskFilters = filters;
  } catch (error) { /* ignore malformed cache */ }
  try {
    const widgets = JSON.parse(localStorage.getItem('taskflow_dashboard_widgets') || 'null');
    if (widgets && typeof widgets === 'object') result.dashboardWidgets = widgets;
  } catch (error) { /* ignore malformed cache */ }
  return Object.keys(result).length ? result : null;
}

function writeLocalPrefsCache(prefs) {
  try { localStorage.setItem('taskflow_prefs_cache', JSON.stringify(prefs)); } catch (error) { /* storage unavailable */ }
}

const schedulePreferencesSave = debounce(() => {
  Api.setPreferences(state.prefs).catch(() => {});
}, 400);

function persistPreferences() {
  writeLocalPrefsCache(state.prefs);
  schedulePreferencesSave();
}

function applyPreferenceStyles() {
  document.body.dataset.density = state.prefs.density || 'normal';
  document.body.dataset.fontSize = state.prefs.fontSize || 'normal';
}

async function loadAll() {
  const [tasks, projects, categories, priorities, statuses, contacts, customers, settings] = await Promise.all([
    Api.tasks(buildTaskQuery()),
    Api.projects(),
    Api.categories(),
    Api.priorities(),
    Api.statuses(),
    Api.contacts(),
    Api.customers(),
    Api.settings()
  ]);
  Object.assign(state, { tasks, projects, categories, priorities, statuses, contacts, customers, settings });
  document.body.classList.toggle('dark', settings.theme === 'dark');
}

function buildTaskQuery() {
  const filters = { ...state.filters };
  delete filters.group_by_category;
  if (filters.status === 'active') {
    delete filters.status;
    filters.exclude_completed = '1';
  }
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  return query ? `?${query}` : '';
}

async function reloadTasks() {
  state.tasks = await Api.tasks(buildTaskQuery());
  renderTasksIfActive();
}

function renderTasksIfActive() {
  if (state.view === 'tasks') renderTasks();
}

async function renderLogin(status = null, mode = null) {
  document.getElementById('app').className = 'auth-shell';
  if (!status) status = await Api.authStatus().catch(() => ({ hasUsers: true }));
  const isRegister = mode ? mode === 'register' : !status.hasUsers;
  document.getElementById('app').innerHTML = `
    <main class="login-screen">
      <form id="login-form" class="login-card" onsubmit="return false">
        <div class="brand login-brand"><span class="brand-mark">${UI.icon('check')}</span><strong>${t.appName}</strong></div>
        <h1>${isRegister ? t.auth.registerTitle : t.auth.title}</h1>
        <p>${isRegister ? t.auth.registerSubtitle : t.auth.subtitle}</p>
        <label>${t.auth.username}<input name="username" autocomplete="username" value="${escapeAttr(localStorage.getItem('taskflow_username') || '')}" required autofocus /></label>
        <label>${t.auth.password}<input type="password" name="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" /></label>
        <button class="primary">${isRegister ? t.auth.createAccount : t.auth.login}</button>
        <div class="auth-switch">
          <span>${isRegister ? t.auth.haveAccount : t.auth.needAccount}</span>
          <button type="button" class="text-button" id="auth-mode-toggle">${isRegister ? t.auth.goToLogin : t.auth.goToRegister}</button>
        </div>
      </form>
    </main>
  `;
  document.getElementById('auth-mode-toggle').onclick = () => renderLogin(status, isRegister ? 'login' : 'register');
  document.getElementById('login-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const username = form.get('username');
    const password = form.get('password');
    try {
      const result = isRegister ? await Api.register(username, password) : await Api.login(username, password);
      Api.setToken(result.token);
      if (result.user?.username) localStorage.setItem('taskflow_username', result.user.username);
      renderShell();
      await loadPreferences();
      state.view = state.prefs.homeView || 'tasks';
      await loadAll();
      renderView();
    } catch (error) {
      UI.toast(error.code === 'USERNAME_EXISTS' ? t.auth.usernameExists : (isRegister ? t.auth.registerFailed : t.auth.invalidPassword));
    }
    return false;
  };
}

function renderShell() {
  document.getElementById('app').className = 'app-shell';
  document.getElementById('app').innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${UI.icon('check')}</span><strong>${t.appName}</strong></div>
      <nav id="sidebar-nav"></nav>
    </aside>
    <main class="main">
      <header class="toolbar">
        <div><h1 id="page-title"></h1><p id="page-subtitle"></p></div>
        <div id="toolbar-actions" class="toolbar-actions"></div><button class="icon-command" id="logout-button" title="${t.auth.logout}">${UI.icon('logout')}</button>
      </header>
      <section id="content" class="content"></section>
    </main>
    <div id="modal-root"></div>
  `;
  renderSidebarNav();
  document.getElementById('logout-button').onclick = async () => {
    await Api.logout().catch(() => null);
    Api.setToken('');
    renderLogin();
  };
}

function renderSidebarNav() {
  const order = sidebarOrderList();
  const hidden = new Set(state.prefs.sidebarHidden || []);
  const visibleKeys = order.filter((key) => key === 'settings' || !hidden.has(key));
  document.getElementById('sidebar-nav').innerHTML = visibleKeys.map(navItem).join('');
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.view = button.dataset.nav;
      renderView();
      await loadAll();
      renderView();
    });
  });
}

function sidebarOrderList() {
  const order = (state.prefs.sidebarOrder && state.prefs.sidebarOrder.length ? state.prefs.sidebarOrder : NAV_KEYS).filter((key) => NAV_KEYS.includes(key));
  NAV_KEYS.forEach((key) => { if (!order.includes(key)) order.push(key); });
  return order;
}

function navItem(key) {
  return `<button class="nav-item" data-nav="${key}">${UI.icon(key)}<span>${t.nav[key]}</span></button>`;
}

function setHeader(title, subtitle = '') {
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = subtitle;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.nav === state.view));
}

function renderView() {
  const actions = document.getElementById('toolbar-actions');
  actions.innerHTML = '';
  if (state.view === 'tasks') {
    setHeader(t.titles.tasks, t.subtitles.tasks);
    actions.innerHTML = `<button class="ghost" id="columns-button">${t.titles.columns}</button><button class="primary" id="add-task">${UI.icon('plus')}${t.titles.addTask}</button>`;
    document.getElementById('columns-button').onclick = () => {
      state.showColumnPicker = !state.showColumnPicker;
      renderTasks();
    };
    document.getElementById('add-task').onclick = () => openTaskModal();
    renderTasks();
  }
  if (state.view === 'dashboard') renderDashboard();
  if (state.view === 'categories') renderCategories();
  if (state.view === 'projects') renderProjects();
  if (state.view === 'customers') renderCustomers();
  if (state.view === 'contacts') renderContacts();
  if (state.view === 'settings') renderSettings();
}

function renderTasks() {
  const visibleColumns = getOrderedVisibleColumns();
  const columnVisible = (column) => state.visibleTaskColumns.includes(column);
  const totalCols = visibleColumns.length + 1;
  const rowsHtml = state.tasks.length
    ? (state.filters.group_by_category ? groupedTaskRows(state.tasks, visibleColumns) : state.tasks.map((task) => taskRow(task, visibleColumns)).join(''))
    : emptyState(totalCols);
  document.getElementById('content').innerHTML = `
    ${savedViewsBar()}
    ${state.showColumnPicker ? columnPicker() : ''}
    <div class="panel filters">
      ${columnVisible('name') ? `<input id="search" placeholder="${t.common.search}" value="${escapeAttr(state.filters.search || '')}" />` : ''}
      ${columnVisible('category') ? `<select id="category-filter"><option value="">${t.fields.category}: ${t.common.all}</option>${options(state.categories, state.filters.category_id)}</select>` : ''}
      ${columnVisible('project') ? `<select id="project-filter"><option value="">${t.fields.project}: ${t.common.all}</option>${options(projectsForCategory(state.filters.category_id), state.filters.project_id)}</select>` : ''}
      ${columnVisible('priority') ? `<select id="priority-filter"><option value="">${t.fields.priority}: ${t.common.all}</option>${priorityOptions(state.filters.priority)}</select>` : ''}
      ${columnVisible('status') ? `<select id="status-filter"><option value="">${t.fields.status}: ${t.common.all}</option><option value="active" ${state.filters.status === 'active' ? 'selected' : ''}>${t.common.activeTasks}</option>${statusOptions(state.filters.status)}</select>` : ''}
      ${columnVisible('due_date') ? `<input id="from-date" type="date" value="${state.filters.from_date || ''}" /><input id="to-date" type="date" value="${state.filters.to_date || ''}" />` : ''}
      <select id="sort-by">${sortOptions()}</select>
      <label class="group-toggle"><input type="checkbox" id="group-by-category" ${state.filters.group_by_category ? 'checked' : ''} />${t.common.groupByCategory}</label>
    </div>
    ${bulkActionsBar()}
    <div class="panel table-panel">
      <table>
        <thead><tr><th class="select-col"><input type="checkbox" id="select-all-tasks" ${allVisibleSelected() ? 'checked' : ''} /></th>${visibleColumns.map((column) => `<th>${taskColumnLabel(column)}</th>`).join('')}</tr></thead>
        <tbody>${quickAddRow(totalCols)}${rowsHtml}</tbody>
      </table>
    </div>
    <button type="button" class="fab" id="fab-quick-add" title="${t.titles.addTask}">${UI.icon('plus')}</button>
  `;
  bindColumnPicker();
  bindFilters();
  bindSavedViews();
  bindTaskActions();
  bindQuickAdd();
  bindBulkActions();
  bindSwipeGestures();
  document.getElementById('empty-clear-filters')?.addEventListener('click', async () => {
    state.filters = { status: 'active', sort_by: 'created_at', sort_dir: 'desc' };
    saveTaskFilters();
    await reloadTasks();
  });
  document.getElementById('fab-quick-add')?.addEventListener('click', openQuickAddSheet);
}

function getOrderedVisibleColumns() {
  const withoutActions = orderedColumnKeysExcludingActions();
  const visible = withoutActions.filter((c) => state.visibleTaskColumns.includes(c));
  visible.push('actions');
  return visible;
}

function orderedColumnKeysExcludingActions() {
  const stored = state.prefs.taskColumnOrder && state.prefs.taskColumnOrder.length ? state.prefs.taskColumnOrder : TASK_COLUMNS;
  const order = stored.filter((c) => c !== 'actions' && TASK_COLUMNS.includes(c));
  TASK_COLUMNS.forEach((c) => { if (c !== 'actions' && !order.includes(c)) order.push(c); });
  return order;
}

function allVisibleSelected() {
  return state.tasks.length > 0 && state.tasks.every((task) => state.selectedTaskIds.has(String(task.id)));
}

function savedViewsBar() {
  const views = state.prefs.savedViews || [];
  return `<div class="saved-views">
    ${views.map((view) => `<span class="view-chip" data-apply-view="${view.id}">${escapeHtml(view.name)}<button type="button" class="view-chip-remove" data-remove-view="${view.id}" title="${t.common.delete}">${UI.icon('close')}</button></span>`).join('')}
    <button type="button" class="view-chip view-chip-add" id="save-view-button">${UI.icon('plus')}${t.common.saveView}</button>
  </div>`;
}

function bindSavedViews() {
  document.querySelectorAll('[data-apply-view]').forEach((chip) => {
    chip.addEventListener('click', (event) => {
      if (event.target.closest('[data-remove-view]')) return;
      applySavedView(chip.dataset.applyView);
    });
  });
  document.querySelectorAll('[data-remove-view]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      state.prefs.savedViews = (state.prefs.savedViews || []).filter((view) => String(view.id) !== button.dataset.removeView);
      persistPreferences();
      renderTasks();
    });
  });
  document.getElementById('save-view-button').onclick = () => {
    const name = window.prompt(t.common.viewNamePrompt, '');
    if (!name || !name.trim()) return;
    const view = { id: String(Date.now()), name: name.trim(), filters: { ...state.filters }, visibleTaskColumns: [...state.visibleTaskColumns] };
    state.prefs.savedViews = [...(state.prefs.savedViews || []), view];
    persistPreferences();
    renderTasks();
  };
}

async function applySavedView(id) {
  const view = (state.prefs.savedViews || []).find((item) => String(item.id) === String(id));
  if (!view) return;
  state.filters = { ...view.filters };
  state.visibleTaskColumns = [...view.visibleTaskColumns];
  state.prefs.taskFilters = state.filters;
  state.prefs.visibleTaskColumns = state.visibleTaskColumns;
  persistPreferences();
  await reloadTasks();
}

function quickAddRow(cols) {
  return `<tr class="quick-add-row"><td colspan="${cols}">
    <div class="quick-add">
      <span class="quick-add-plus">${UI.icon('plus')}</span>
      <input id="quick-add-input" placeholder="${t.common.quickAddPlaceholder}" autocomplete="off" />
      <div id="quick-add-preview" class="quick-add-preview"></div>
      <button type="button" class="primary quick-add-button" id="quick-add-button">${t.common.add}</button>
    </div>
  </td></tr>`;
}

function bindQuickAdd() {
  const input = document.getElementById('quick-add-input');
  const button = document.getElementById('quick-add-button');
  if (!input || !button) return;
  input.addEventListener('input', () => renderQuickAddPreview(parseQuickAddInput(input.value)));
  const submit = async () => {
    const raw = input.value.trim();
    if (!raw) return input.focus();
    const parsed = parseQuickAddInput(raw);
    if (!parsed.name) return input.focus();
    const body = { name: parsed.name };
    body.category_id = parsed.category_id || state.filters.category_id || '';
    body.project_id = parsed.project_id || state.filters.project_id || '';
    body.priority = parsed.priority || state.filters.priority || '';
    if (parsed.due_date) body.due_date = parsed.due_date;
    if (state.filters.status && state.filters.status !== 'active') body.status = state.filters.status;
    Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
    const tempId = `temp-${Date.now()}`;
    state.tasks = [buildOptimisticTask(tempId, body), ...state.tasks];
    renderTasksIfActive();
    document.getElementById('quick-add-input')?.focus();
    UI.toast(t.messages.taskSaved);
    try {
      await Api.createTask(body);
      await reloadTasks();
    } catch (error) {
      state.tasks = state.tasks.filter((task) => task.id !== tempId);
      renderTasksIfActive();
      UI.toast(t.messages.networkError);
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  button.onclick = submit;
}

function buildOptimisticTask(id, body) {
  const category = state.categories.find((item) => String(item.id) === String(body.category_id));
  const project = state.projects.find((item) => String(item.id) === String(body.project_id));
  return {
    id,
    name: body.name,
    status: body.status || defaultStatusKey(),
    priority: body.priority || defaultPriorityKey(),
    category_id: body.category_id || null,
    category_color: category?.color || null,
    category_name: category?.name || null,
    project_id: body.project_id || null,
    project_name: project?.name || null,
    contact_id: null,
    contact_name: null,
    due_date: body.due_date || null,
    created_at: new Date().toISOString(),
    tags: ''
  };
}

function renderQuickAddPreview(parsed) {
  const container = document.getElementById('quick-add-preview');
  if (!container) return;
  const chips = [];
  if (parsed.priority) chips.push(`<span class="parse-chip">${escapeHtml(priorityLabel(parsed.priority))}</span>`);
  if (parsed.project_id) {
    const project = state.projects.find((item) => String(item.id) === String(parsed.project_id));
    if (project) chips.push(`<span class="parse-chip">${escapeHtml(project.name)}</span>`);
  } else if (parsed.category_id) {
    const category = state.categories.find((item) => String(item.id) === String(parsed.category_id));
    if (category) chips.push(`<span class="parse-chip">${escapeHtml(category.name)}</span>`);
  }
  if (parsed.due_date) chips.push(`<span class="parse-chip">${UI.formatDate(parsed.due_date)}</span>`);
  container.innerHTML = chips.join('');
}

function parseQuickAddInput(raw) {
  let name = raw;
  const result = {};
  name = name.replace(/!([^\s!#@]+)/, (match, token) => {
    const clean = token.trim();
    const found = state.priorities.find((item) => item.key === clean || item.name === clean || item.name.includes(clean));
    if (found) result.priority = found.key;
    return '';
  });
  name = name.replace(/#([^\s!#@]+(?:\s[^\s!#@]+)*?)(?=\s*[!@#]|$)/, (match, token) => {
    const clean = token.trim();
    const project = state.projects.find((item) => item.name === clean) || state.projects.find((item) => item.name.includes(clean));
    if (project) {
      result.project_id = project.id;
      if (project.category_id) result.category_id = project.category_id;
      return '';
    }
    const category = state.categories.find((item) => item.name === clean) || state.categories.find((item) => item.name.includes(clean));
    if (category) result.category_id = category.id;
    return '';
  });
  name = name.replace(/@([^\s!#@]+(?:\s[^\s!#@]+)*?)(?=\s*[!@#]|$)/, (match, token) => {
    const date = parseNaturalDate(token.trim());
    if (date) result.due_date = date;
    return '';
  });
  result.name = name.replace(/\s+/g, ' ').trim();
  return result;
}

function parseNaturalDate(token) {
  if (token === 'היום') return todayLocalString();
  if (token === 'מחר') return addDaysToDateString(todayLocalString(), 1);
  if (token === 'מחרתיים') return addDaysToDateString(todayLocalString(), 2);
  const weekdayIndex = WEEKDAY_NAMES.findIndex((day) => token.includes(day));
  if (weekdayIndex !== -1) return nextWeekdayDate(weekdayIndex);
  const match = token.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = year ? (year.length === 2 ? `20${year}` : year) : String(new Date().getFullYear());
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function nextWeekdayDate(targetIndex) {
  const currentIndex = new Date().getDay();
  let diff = targetIndex - currentIndex;
  if (diff <= 0) diff += 7;
  return addDaysToDateString(todayLocalString(), diff);
}

function openQuickAddSheet() {
  lastFocusedElement = document.activeElement;
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop sheet-backdrop">
    <div class="bottom-sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <input id="sheet-quick-input" placeholder="${t.common.quickAddPlaceholder}" autocomplete="off" />
      <div class="sheet-row">
        <select id="sheet-category"><option value="">${t.fields.category}</option>${options(state.categories, '')}</select>
        <select id="sheet-priority"><option value="">${t.fields.priority}</option>${priorityOptions('')}</select>
      </div>
      <button type="button" class="primary sheet-save" id="sheet-save">${UI.icon('plus')}${t.common.add}</button>
    </div>
  </div>`;
  document.getElementById('sheet-quick-input').focus();
  const submit = async () => {
    const raw = document.getElementById('sheet-quick-input').value.trim();
    if (!raw) return;
    const parsed = parseQuickAddInput(raw);
    const body = { name: parsed.name || raw };
    body.category_id = parsed.category_id || document.getElementById('sheet-category').value || '';
    body.priority = parsed.priority || document.getElementById('sheet-priority').value || '';
    if (parsed.due_date) body.due_date = parsed.due_date;
    Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
    closeModal();
    try {
      await Api.createTask(body);
      await reloadTasks();
      UI.toast(t.messages.taskSaved);
    } catch (error) {
      UI.toast(t.messages.networkError);
    }
  };
  document.getElementById('sheet-save').onclick = submit;
  document.getElementById('sheet-quick-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
  });
}

function columnPicker() {
  const order = orderedColumnKeysExcludingActions();
  return `<div class="panel column-picker">
    <strong>${t.titles.visibleColumns}</strong>
    <div class="column-picker-list">
      ${order.map((column, index) => `
        <div class="column-picker-row">
          <label class="check-option"><input type="checkbox" data-column="${column}" ${state.visibleTaskColumns.includes(column) ? 'checked' : ''} />${taskColumnLabel(column)}</label>
          <div class="order-buttons">
            <button type="button" class="icon-mini" data-move-column="${column}" data-dir="up" ${index === 0 ? 'disabled' : ''}>${UI.icon('up')}</button>
            <button type="button" class="icon-mini" data-move-column="${column}" data-dir="down" ${index === order.length - 1 ? 'disabled' : ''}>${UI.icon('down')}</button>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

function taskColumnLabel(column) {
  const labels = {
    status: t.fields.status,
    priority: t.fields.priority,
    name: t.fields.taskName,
    category: t.fields.category,
    project: t.fields.project,
    contact: t.fields.contact,
    due_date: t.fields.dueDate,
    created_at: t.fields.createdDate,
    actions: t.common.actions
  };
  return labels[column] || column;
}

function bindColumnPicker() {
  document.querySelectorAll('[data-column]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const selected = [...document.querySelectorAll('[data-column]:checked')].map((item) => item.dataset.column);
      state.visibleTaskColumns = selected.length ? [...new Set([...selected, 'actions'])] : ['name', 'actions'];
      state.prefs.visibleTaskColumns = state.visibleTaskColumns;
      persistPreferences();
      if (!state.visibleTaskColumns.includes(state.filters.sort_by)) {
        state.filters.sort_by = SORT_FIELDS.find((field) => state.visibleTaskColumns.includes(field)) || state.filters.sort_by;
        saveTaskFilters();
        await reloadTasks();
        return;
      }
      renderTasks();
    });
  });
  document.querySelectorAll('[data-move-column]').forEach((button) => {
    button.addEventListener('click', () => {
      const order = orderedColumnKeysExcludingActions();
      const idx = order.indexOf(button.dataset.moveColumn);
      const target = button.dataset.dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= order.length) return;
      [order[idx], order[target]] = [order[target], order[idx]];
      state.prefs.taskColumnOrder = [...order, 'actions'];
      persistPreferences();
      renderTasks();
    });
  });
}

function bulkActionsBar() {
  const count = state.selectedTaskIds.size;
  if (!count) return '';
  return `<div class="panel bulk-bar">
    <strong>${count} ${t.common.selected}</strong>
    <div class="bulk-actions">
      <select id="bulk-category-select"><option value="">${t.common.bulkSetCategory}</option>${options(state.categories, '')}</select>
      <button type="button" class="ghost" id="bulk-complete">${UI.icon('check')}${t.common.complete}</button>
      <button type="button" class="ghost" id="bulk-delete">${UI.icon('trash')}${t.common.delete}</button>
      <button type="button" class="text-button" id="bulk-clear">${t.common.clearSelection}</button>
    </div>
  </div>`;
}

function bindBulkActions() {
  document.getElementById('select-all-tasks')?.addEventListener('change', (event) => {
    if (event.target.checked) state.tasks.forEach((task) => state.selectedTaskIds.add(String(task.id)));
    else state.selectedTaskIds.clear();
    renderTasks();
  });
  document.querySelectorAll('[data-select-task]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const id = String(checkbox.dataset.selectTask);
      if (checkbox.checked) state.selectedTaskIds.add(id);
      else state.selectedTaskIds.delete(id);
      renderTasks();
    });
  });
  document.getElementById('bulk-complete')?.addEventListener('click', async () => {
    const ids = [...state.selectedTaskIds];
    state.selectedTaskIds.clear();
    await Promise.all(ids.map((id) => Api.completeTask(id).catch(() => {})));
    await reloadTasks();
    UI.toast(t.messages.bulkCompleted);
  });
  document.getElementById('bulk-delete')?.addEventListener('click', async () => {
    const ids = [...state.selectedTaskIds];
    state.selectedTaskIds.clear();
    await Promise.all(ids.map((id) => Api.deleteTask(id).catch(() => {})));
    await reloadTasks();
    UI.toast(t.messages.bulkDeleted);
  });
  document.getElementById('bulk-category-select')?.addEventListener('change', async (event) => {
    const categoryId = event.target.value;
    if (!categoryId) return;
    const ids = [...state.selectedTaskIds];
    state.selectedTaskIds.clear();
    await Promise.all(ids.map((id) => {
      const body = buildQuickPatchBody(id, { category_id: categoryId, project_id: '' });
      return body ? Api.updateTask(id, body).catch(() => {}) : Promise.resolve();
    }));
    await reloadTasks();
    UI.toast(t.messages.saved);
  });
  document.getElementById('bulk-clear')?.addEventListener('click', () => {
    state.selectedTaskIds.clear();
    renderTasks();
  });
}

function bindFilters() {
  const valueOf = (id) => document.getElementById(id)?.value || '';
  const apply = async () => {
    const focusSnapshot = captureFocus();
    state.filters = {
      ...state.filters,
      search: valueOf('search'),
      project_id: valueOf('project-filter'),
      category_id: valueOf('category-filter'),
      priority: valueOf('priority-filter'),
      status: valueOf('status-filter'),
      from_date: valueOf('from-date'),
      to_date: valueOf('to-date'),
      sort_by: document.getElementById('sort-by').value,
      sort_dir: 'desc'
    };
    state.selectedTaskIds.clear();
    saveTaskFilters();
    await reloadTasks();
    restoreFocus(focusSnapshot);
  };
  document.querySelectorAll('.filters input, .filters select').forEach((control) => control.addEventListener('input', debounce(apply, 250)));
  document.getElementById('group-by-category')?.addEventListener('change', (event) => {
    state.filters.group_by_category = event.target.checked;
    saveTaskFilters();
    renderTasks();
  });
}

function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id) return null;
  return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const el = document.getElementById(snapshot.id);
  if (!el) return;
  el.focus();
  if (typeof snapshot.start === 'number' && el.setSelectionRange) {
    try { el.setSelectionRange(snapshot.start, snapshot.end); } catch (error) { /* ignore inputs without text selection support */ }
  }
}

function saveTaskFilters() {
  state.prefs.taskFilters = state.filters;
  persistPreferences();
}

function groupedTaskRows(tasks, columns) {
  const groups = new Map();
  tasks.forEach((task) => {
    const key = task.category_id || '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  });
  const sortedCategories = [...state.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const orderedKeys = [...sortedCategories.map((category) => category.id), '__none__'].filter((key) => groups.has(key));
  return orderedKeys.map((key) => {
    const groupTasks = groups.get(key);
    const category = sortedCategories.find((item) => item.id === key);
    const label = category ? category.name : t.common.noCategory;
    const color = category ? category.color : '#94a3b8';
    const header = `<tr class="group-header-row"><td colspan="${columns.length + 1}"><span class="cell-dot" style="--dot:${color}"></span>${escapeHtml(label)}<span class="group-count">${groupTasks.length}</span></td></tr>`;
    return header + groupTasks.map((task) => taskRow(task, columns)).join('');
  }).join('');
}

function emptyState(cols) {
  const hasFilters = Boolean(state.filters.search || state.filters.category_id || state.filters.project_id || state.filters.priority || (state.filters.status && state.filters.status !== 'active') || state.filters.from_date || state.filters.to_date);
  if (hasFilters) {
    return `<tr><td colspan="${cols}" class="empty-state"><p>${t.common.noResultsFiltered}</p><button type="button" class="ghost" id="empty-clear-filters">${t.common.clearFilters}</button></td></tr>`;
  }
  return `<tr><td colspan="${cols}" class="empty-state"><p class="empty-emoji">${t.common.noOpenTasks}</p></td></tr>`;
}

function taskRow(task, columns) {
  const classes = [];
  if (task.category_color) classes.push('cat-row');
  if (pendingComplete && String(pendingComplete.id) === String(task.id)) classes.push('row-pending-complete');
  const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
  const style = task.category_color ? ` style="--cat-color:${escapeAttr(task.category_color)}"` : '';
  const selectCell = `<td class="select-col"><input type="checkbox" class="row-select" data-select-task="${task.id}" ${state.selectedTaskIds.has(String(task.id)) ? 'checked' : ''} /></td>`;
  return `<tr${classAttr}${style} data-swipe-id="${task.id}">${selectCell}${columns.map((column) => taskCell(task, column)).join('')}</tr>`;
}

function taskCell(task, column) {
  if (column === 'actions') return actionsCell(task);
  if (column === 'due_date') return dueDateCell(task);
  if (column === 'created_at') return createdDateCell(task);
  return isCellEditing(task.id, column) ? editableCell(task, column) : readOnlyCell(task, column);
}

function isCellEditing(taskId, column) {
  return state.editingCells.has(`${taskId}:${column}`);
}

function startEditingCell(taskId, column) {
  state.editingCells.add(`${taskId}:${column}`);
  renderTasksIfActive();
  setTimeout(() => {
    document.querySelector(`[data-quick-field="${column}"][data-task-id="${taskId}"]`)?.focus();
  }, 0);
}

function stopEditingCell(taskId, column) {
  state.editingCells.delete(`${taskId}:${column}`);
}

function readOnlyCell(task, column) {
  const label = taskColumnLabel(column);
  return `<td class="read-cell" data-cell-click="${column}" data-task-id="${task.id}" data-label="${escapeAttr(label)}" tabindex="0" role="button" aria-label="${escapeAttr(label)}">${readCellContent(task, column)}</td>`;
}

function readCellContent(task, column) {
  if (column === 'status') return statusChip(task.status);
  if (column === 'priority') return priorityChip(task.priority);
  if (column === 'name') return `<span class="cell-primary">${escapeHtml(task.name)}</span>${task.tags ? `<small>${escapeHtml(task.tags)}</small>` : ''}`;
  if (column === 'category') return task.category_name ? `<span class="cell-dot" style="--dot:${task.category_color || '#94a3b8'}"></span>${escapeHtml(task.category_name)}` : `<span class="cell-muted">${t.common.noCategory}</span>`;
  if (column === 'project') return task.project_name ? escapeHtml(task.project_name) : `<span class="cell-muted">${t.common.noProject}</span>`;
  if (column === 'contact') return task.contact_name ? escapeHtml(task.contact_name) : `<span class="cell-muted">—</span>`;
  return '';
}

function editableCell(task, column) {
  const projectOptions = projectsForCategory(task.category_id);
  const builders = {
    status: () => `<select class="quick-select quick-status" data-quick-field="status" data-task-id="${task.id}" aria-label="${t.fields.status}">${statusOptions(task.status)}</select>`,
    priority: () => `<select class="quick-select quick-priority" data-quick-field="priority" data-task-id="${task.id}" aria-label="${t.fields.priority}">${priorityOptions(task.priority)}</select>`,
    name: () => `<input class="quick-input quick-task-name" data-quick-field="name" data-task-id="${task.id}" value="${escapeAttr(task.name)}" aria-label="${t.fields.taskName}" />`,
    category: () => `<select class="quick-select quick-category" data-quick-field="category_id" data-task-id="${task.id}" aria-label="${t.fields.category}"><option value="">${t.common.choose}</option>${options(state.categories, task.category_id)}</select>`,
    project: () => `<select class="quick-select quick-project" data-quick-field="project_id" data-task-id="${task.id}" aria-label="${t.fields.project}"><option value="">${t.common.choose}</option>${options(projectOptions, task.project_id)}</select>`,
    contact: () => `<select class="quick-select quick-contact" data-quick-field="contact_id" data-task-id="${task.id}" aria-label="${t.fields.contact}"><option value="">${t.common.choose}</option>${options(state.contacts, task.contact_id)}</select>`
  };
  const control = builders[column] ? builders[column]() : '';
  return `<td class="edit-cell" data-label="${escapeAttr(taskColumnLabel(column))}">${control}</td>`;
}

function dueDateCell(task) {
  const label = escapeAttr(t.fields.dueDate);
  if (isCellEditing(task.id, 'due_date')) {
    return `<td data-label="${label}"><div class="due-cell">
      <input class="quick-input quick-date" type="date" data-quick-field="due_date" data-task-id="${task.id}" value="${UI.dateInput(task.due_date)}" aria-label="${t.fields.dueDate}" />
      <div class="due-quick-chips">
        <button type="button" class="due-chip" data-due-quick="today" data-task-id="${task.id}">${t.common.today}</button>
        <button type="button" class="due-chip" data-due-quick="tomorrow" data-task-id="${task.id}">${t.common.tomorrow}</button>
      </div>
    </div></td>`;
  }
  const badge = dueDateBadge(task.due_date, task.status);
  const text = task.due_date ? UI.formatDate(task.due_date) : `<span class="cell-muted">—</span>`;
  return `<td class="read-cell" data-cell-click="due_date" data-task-id="${task.id}" data-label="${label}" tabindex="0" role="button" aria-label="${t.fields.dueDate}"><span class="cell-primary">${text}</span>${badge}</td>`;
}

function createdDateCell(task) {
  const label = escapeAttr(t.fields.createdDate);
  if (isCellEditing(task.id, 'created_at')) {
    return `<td data-label="${label}"><input class="quick-input quick-date" type="date" data-quick-field="created_at" data-task-id="${task.id}" value="${UI.dateInput(task.created_at)}" aria-label="${t.fields.createdDate}" /></td>`;
  }
  return `<td class="read-cell" data-cell-click="created_at" data-task-id="${task.id}" data-label="${label}" tabindex="0" role="button" aria-label="${t.fields.createdDate}">${UI.formatDate(task.created_at)}</td>`;
}

function actionsCell(task) {
  return `<td data-label="${escapeAttr(t.common.actions)}"><div class="row-actions">
    <button title="${t.common.edit}" data-edit="${task.id}">${UI.icon('edit')}</button>
    <button title="${t.common.complete}" data-complete="${task.id}">${UI.icon('check')}</button>
    <button title="${t.common.duplicate}" data-duplicate="${task.id}">${UI.icon('copy')}</button>
    <button title="${t.common.delete}" data-delete="${task.id}">${UI.icon('trash')}</button>
  </div></td>`;
}

function statusChip(statusKey) {
  const meta = state.statuses.find((item) => item.key === statusKey);
  const color = meta?.color || '#64748b';
  return `<span class="chip" style="color:${color};background:color-mix(in srgb, ${color} 16%, transparent)">${statusLabel(statusKey)}</span>`;
}

function priorityChip(priorityKey) {
  const meta = state.priorities.find((item) => item.key === priorityKey);
  const color = meta?.color || '#64748b';
  return `<span class="chip" style="color:${color};background:color-mix(in srgb, ${color} 16%, transparent)">${priorityLabel(priorityKey)}</span>`;
}

function todayLocalString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dueDateBadge(dueDate, status) {
  if (!dueDate || doneStatusKeys().includes(status)) return '';
  const datePart = String(dueDate).slice(0, 10);
  const today = todayLocalString();
  const tomorrow = addDaysToDateString(today, 1);
  if (datePart < today) return `<span class="due-badge due-overdue">${t.common.overdue}</span>`;
  if (datePart === today) return `<span class="due-badge due-today">${t.common.today}</span>`;
  if (datePart === tomorrow) return `<span class="due-badge due-tomorrow">${t.common.tomorrow}</span>`;
  return '';
}

function bindTaskActions() {
  document.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => openTaskModal(state.tasks.find((task) => task.id == button.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach((button) => button.onclick = () => removeTask(button.dataset.delete));
  document.querySelectorAll('[data-complete]').forEach((button) => button.onclick = () => completeTaskWithUndo(button.dataset.complete));
  document.querySelectorAll('[data-duplicate]').forEach((button) => button.onclick = () => mutateTask(() => Api.duplicateTask(button.dataset.duplicate)));
  document.querySelectorAll('[data-cell-click]').forEach((cell) => {
    const activate = () => startEditingCell(cell.dataset.taskId, cell.dataset.cellClick);
    cell.addEventListener('click', activate);
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
  });
  document.querySelectorAll('[data-due-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = button.closest('.due-cell')?.querySelector('.quick-date');
      if (!input) return;
      input.value = addDaysToDateString(todayLocalString(), button.dataset.dueQuick === 'tomorrow' ? 1 : 0);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  document.querySelectorAll('[data-quick-field]').forEach((control) => {
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        control.blur();
      }
    });
    control.addEventListener('blur', (event) => {
      const cell = control.closest('.due-cell');
      const movingTo = event.relatedTarget;
      if (cell && movingTo && movingTo.closest && movingTo.closest('.due-cell') === cell) return;
      stopEditingCell(control.dataset.taskId, control.dataset.quickField);
      renderTasksIfActive();
    });
    control.addEventListener('change', () => {
      const field = control.dataset.quickField;
      const patch = { [field]: control.value };
      if (field === 'category_id') patch.project_id = '';
      if (field === 'project_id' && control.value) {
        const project = state.projects.find((item) => String(item.id) === String(control.value));
        if (project?.category_id) patch.category_id = project.category_id;
      }
      quickUpdateTask(control.dataset.taskId, patch);
    });
  });
}

function bindSwipeGestures() {
  if (!window.matchMedia(MOBILE_BREAKPOINT).matches) return;
  document.querySelectorAll('tbody tr[data-swipe-id]').forEach((row) => {
    let startX = 0;
    let deltaX = 0;
    let dragging = false;
    row.addEventListener('touchstart', (event) => {
      startX = event.touches[0].clientX;
      dragging = true;
      row.style.transition = 'none';
    }, { passive: true });
    row.addEventListener('touchmove', (event) => {
      if (!dragging) return;
      deltaX = event.touches[0].clientX - startX;
      row.style.transform = `translateX(${deltaX}px)`;
    }, { passive: true });
    row.addEventListener('touchend', () => {
      dragging = false;
      row.style.transition = '';
      row.style.transform = '';
      const threshold = 80;
      const id = row.dataset.swipeId;
      if (deltaX > threshold) completeTaskWithUndo(id);
      else if (deltaX < -threshold) removeTask(id);
      deltaX = 0;
    });
  });
}

function buildQuickPatchBody(id, patch) {
  const task = state.tasks.find((item) => String(item.id) === String(id));
  if (!task) return null;
  return {
    name: task.name,
    description: task.description || '',
    project_id: task.project_id || '',
    category_id: task.category_id || '',
    contact_id: task.contact_id || '',
    priority: task.priority || defaultPriorityKey(),
    status: task.status || defaultStatusKey(),
    created_at: task.created_at || '',
    due_date: task.due_date || '',
    tags: task.tags || '',
    notes: task.notes || '',
    ...patch
  };
}

function mapPatchFieldToColumn(field) {
  const map = { category_id: 'category', project_id: 'project', contact_id: 'contact' };
  return map[field] || field;
}

function applyLocalPatch(task, patch) {
  Object.assign(task, patch);
  if ('category_id' in patch) {
    const category = state.categories.find((item) => String(item.id) === String(patch.category_id));
    task.category_color = category?.color || null;
    task.category_name = category?.name || null;
  }
  if ('project_id' in patch) {
    const project = state.projects.find((item) => String(item.id) === String(patch.project_id));
    task.project_name = project?.name || null;
  }
  if ('contact_id' in patch) {
    const contact = state.contacts.find((item) => String(item.id) === String(patch.contact_id));
    task.contact_name = contact?.name || null;
  }
}

async function quickUpdateTask(id, patch) {
  const task = state.tasks.find((item) => String(item.id) === String(id));
  if (!task) return;
  const body = buildQuickPatchBody(id, patch);
  if (!body || !String(body.name || '').trim()) return UI.toast(t.messages.requiredTaskName);
  const previous = { ...task };
  applyLocalPatch(task, patch);
  Object.keys(patch).forEach((field) => stopEditingCell(id, mapPatchFieldToColumn(field)));
  renderTasksIfActive();
  try {
    await Api.updateTask(id, body);
    await reloadTasks();
    UI.toast(t.messages.quickSaved);
  } catch (error) {
    Object.assign(task, previous);
    renderTasksIfActive();
    UI.toast(t.messages.networkError);
  }
}

async function removeTask(id) {
  const index = state.tasks.findIndex((item) => String(item.id) === String(id));
  if (index === -1) return;
  if (pendingDelete) await commitPendingDelete();
  const [task] = state.tasks.splice(index, 1);
  pendingDelete = { task, index, id };
  renderTasksIfActive();
  UI.toast(t.messages.taskDeletedUndo, {
    actionLabel: t.common.undo,
    onAction: undoDelete,
    duration: UNDO_WINDOW_MS
  });
  pendingDelete.timer = setTimeout(commitPendingDelete, UNDO_WINDOW_MS);
}

async function commitPendingDelete() {
  if (!pendingDelete) return;
  const { id, timer } = pendingDelete;
  clearTimeout(timer);
  pendingDelete = null;
  await Api.deleteTask(id);
}

function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  state.tasks.splice(pendingDelete.index, 0, pendingDelete.task);
  pendingDelete = null;
  renderTasksIfActive();
}

function completeTaskWithUndo(id) {
  const task = state.tasks.find((item) => String(item.id) === String(id));
  if (!task) return;
  if (pendingComplete) commitPendingComplete();
  pendingComplete = { id, previousStatus: task.status };
  task.status = defaultDoneKey();
  renderTasksIfActive();
  UI.toast(t.messages.taskCompletedUndo, {
    actionLabel: t.common.undo,
    onAction: undoComplete,
    duration: UNDO_WINDOW_MS
  });
  pendingComplete.timer = setTimeout(commitPendingComplete, UNDO_WINDOW_MS);
}

function commitPendingComplete() {
  if (!pendingComplete) return;
  const { id, timer } = pendingComplete;
  clearTimeout(timer);
  pendingComplete = null;
  Api.completeTask(id).then(reloadTasks).catch(() => {});
}

function undoComplete() {
  if (!pendingComplete) return;
  clearTimeout(pendingComplete.timer);
  const task = state.tasks.find((item) => String(item.id) === String(pendingComplete.id));
  if (task) task.status = pendingComplete.previousStatus;
  pendingComplete = null;
  renderTasksIfActive();
}

async function mutateTask(action) {
  await action();
  await reloadTasks();
}

function openTaskModal(task = null) {
  lastFocusedElement = document.activeElement;
  const isEdit = Boolean(task);
  const modal = document.getElementById('modal-root');
  modal.innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="task-form" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${isEdit ? t.titles.editTask : t.titles.addTask}</h2><div class="modal-head-actions"><button class="primary" type="submit">${UI.icon('save')}${t.common.save}</button><button type="button" data-close>&times;</button></div></div>
    <div class="form-grid">
      <label>${t.fields.taskName}<input required name="name" value="${escapeAttr(task?.name || '')}" /></label>
      <label>${t.fields.priority}<select name="priority">${priorityOptions(task?.priority || defaultPriorityKey())}</select></label>
      <label>${t.fields.category}<select id="task-category" name="category_id"><option value="">${t.common.choose}</option>${options(state.categories, task?.category_id)}</select></label>
      <label>${t.fields.project}<select id="task-project" name="project_id"><option value="">${t.common.choose}</option>${options(projectsForCategory(task?.category_id), task?.project_id)}</select></label>
      <label>${t.fields.contact}<select name="contact_id"><option value="">${t.common.choose}</option>${options(state.contacts, task?.contact_id)}</select></label>
      <label>${t.fields.status}<select name="status">${statusOptions(task?.status || defaultStatusKey())}</select></label>
      <label>${t.fields.createdDate}<input type="date" name="created_at" value="${UI.dateInput(task?.created_at || new Date())}" /></label>
      <label>${t.fields.dueDate}
        <input type="date" name="due_date" id="task-due-date" value="${UI.dateInput(task?.due_date)}" />
        <div class="due-quick-chips modal-due-chips">
          <button type="button" class="due-chip" data-modal-due="today">${t.common.today}</button>
          <button type="button" class="due-chip" data-modal-due="tomorrow">${t.common.tomorrow}</button>
          <button type="button" class="due-chip" data-modal-due="week">${t.common.inWeek}</button>
        </div>
      </label>
      <label>${t.fields.tags}<input name="tags" value="${escapeAttr(task?.tags || '')}" /></label>
      <label class="wide">${t.fields.description}<textarea name="description">${escapeHtml(task?.description || '')}</textarea></label>
      <label class="wide">${t.fields.notes}<textarea name="notes">${escapeHtml(task?.notes || '')}</textarea></label>
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>${t.common.cancel}</button><button class="primary" type="submit">${UI.icon('save')}${t.common.save}</button></div>
  </form></div>`;
  modal.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeModal);
  const taskCategory = document.getElementById('task-category');
  const taskProject = document.getElementById('task-project');
  if (taskCategory && taskProject) {
    taskCategory.addEventListener('change', () => {
      taskProject.innerHTML = `<option value="">${t.common.choose}</option>${options(projectsForCategory(taskCategory.value), '')}`;
    });
  }
  modal.querySelectorAll('[data-modal-due]').forEach((button) => {
    button.addEventListener('click', () => {
      const days = button.dataset.modalDue === 'tomorrow' ? 1 : button.dataset.modalDue === 'week' ? 7 : 0;
      document.getElementById('task-due-date').value = addDaysToDateString(todayLocalString(), days);
    });
  });
  document.querySelector('#task-form [name="name"]')?.focus();
  document.getElementById('task-form').onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    if (!body.name.trim()) return UI.toast(t.messages.requiredTaskName);
    if (isEdit) await Api.updateTask(task.id, body); else await Api.createTask(body);
    closeModal();
    await reloadTasks();
    UI.toast(t.messages.taskSaved);
  };
}

function renderDashboard() {
  setHeader(t.titles.dashboard, t.subtitles.dashboard);
  Api.dashboard().then((data) => {
    const summary = data.summary || {};
    const selected = state.dashboardWidgets;
    const toneMap = { open_tasks: 'blue', completed_tasks: 'green', overdue_tasks: 'red', today_tasks: 'amber' };
    const cards = DASHBOARD_CARD_WIDGETS.filter((key) => selected[key]).map((key) => statCard(t.dashboard[key], summary[key] || 0, toneMap[key])).join('');
    const panelOrder = getDashboardPanelOrder();
    const panelData = { byPriority: data.byPriority || [], byCategory: data.byCategory || [], byProject: data.byProject || [], recent: data.recent || [] };
    const panels = panelOrder.filter((key) => selected[key]).map((key) => {
      const full = state.prefs.dashboardWidgetSize?.[key] === 'full';
      const html = key === 'recent' ? recentActivityPanel(panelData.recent) : chartPanel(t.titles[chartTitleKey(key)], panelData[key]);
      return `<div class="${full ? 'dashboard-grid-full' : ''}">${html}</div>`;
    }).join('');
    document.getElementById('content').innerHTML = `
      <section class="dashboard-preferences panel">
        <div><h2>${t.dashboard.customizeTitle}</h2><p>${t.dashboard.customizeSubtitle}</p></div>
        <div class="dashboard-options">
          ${DASHBOARD_CARD_WIDGETS.map((key) => dashboardOption(key, t.dashboard[key], selected[key])).join('')}
        </div>
        <div class="dashboard-options-ordered">
          ${panelOrder.map((key, index) => dashboardPanelOption(key, index, panelOrder.length)).join('')}
        </div>
      </section>
      ${cards ? `<div class="stats-grid">${cards}</div>` : ''}
      ${panels ? `<div class="dashboard-grid">${panels}</div>` : `<div class="panel empty-panel">${t.dashboard.noWidgets}</div>`}`;
    bindDashboardControls();
  });
}

function chartTitleKey(key) {
  return { byPriority: 'tasksByPriority', byCategory: 'tasksByCategory', byProject: 'tasksByProject' }[key] || 'recentActivity';
}

function getDashboardPanelOrder() {
  const stored = state.prefs.dashboardPanelOrder && state.prefs.dashboardPanelOrder.length ? state.prefs.dashboardPanelOrder : DASHBOARD_PANEL_WIDGETS;
  const order = stored.filter((key) => DASHBOARD_PANEL_WIDGETS.includes(key));
  DASHBOARD_PANEL_WIDGETS.forEach((key) => { if (!order.includes(key)) order.push(key); });
  return order;
}

function dashboardOption(key, label, checked) {
  return `<label class="dashboard-option"><input type="checkbox" data-dashboard-widget="${key}" ${checked ? 'checked' : ''} /> <span>${escapeHtml(label)}</span></label>`;
}

function dashboardPanelOption(key, index, total) {
  const full = state.prefs.dashboardWidgetSize?.[key] === 'full';
  return `<div class="dashboard-option-row">
    <label class="dashboard-option"><input type="checkbox" data-dashboard-widget="${key}" ${state.dashboardWidgets[key] ? 'checked' : ''} /> <span>${escapeHtml(t.dashboard[key])}</span></label>
    <label class="dashboard-option-size"><input type="checkbox" data-dashboard-widget-full="${key}" ${full ? 'checked' : ''} />${t.dashboard.fullWidth}</label>
    <div class="order-buttons">
      <button type="button" class="icon-mini" data-move-widget="${key}" data-dir="up" ${index === 0 ? 'disabled' : ''}>${UI.icon('up')}</button>
      <button type="button" class="icon-mini" data-move-widget="${key}" data-dir="down" ${index === total - 1 ? 'disabled' : ''}>${UI.icon('down')}</button>
    </div>
  </div>`;
}

function bindDashboardControls() {
  document.querySelectorAll('[data-dashboard-widget]').forEach((input) => {
    input.onchange = () => {
      state.dashboardWidgets[input.dataset.dashboardWidget] = input.checked;
      state.prefs.dashboardWidgets = state.dashboardWidgets;
      persistPreferences();
      renderDashboard();
    };
  });
  document.querySelectorAll('[data-dashboard-widget-full]').forEach((input) => {
    input.onchange = () => {
      state.prefs.dashboardWidgetSize = { ...(state.prefs.dashboardWidgetSize || {}) };
      state.prefs.dashboardWidgetSize[input.dataset.dashboardWidgetFull] = input.checked ? 'full' : 'half';
      persistPreferences();
      renderDashboard();
    };
  });
  document.querySelectorAll('[data-move-widget]').forEach((button) => {
    button.addEventListener('click', () => {
      const order = getDashboardPanelOrder();
      const idx = order.indexOf(button.dataset.moveWidget);
      const target = button.dataset.dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= order.length) return;
      [order[idx], order[target]] = [order[target], order[idx]];
      state.prefs.dashboardPanelOrder = order;
      persistPreferences();
      renderDashboard();
    });
  });
}
function renderCategories() {
  setHeader(t.titles.categories, t.subtitles.categories);
  document.getElementById('toolbar-actions').innerHTML = `<button class="primary" id="add-category">${UI.icon('plus')}${t.titles.addCategory}</button>`;
  document.getElementById('content').innerHTML = `<div class="cards-list">${state.categories.map(categoryCard).join('') || `<div class="panel">${t.common.empty}</div>`}</div>`;
  document.getElementById('add-category').onclick = () => openCategoryModal();
  document.querySelectorAll('[data-edit-category]').forEach((button) => button.onclick = () => openCategoryModal(state.categories.find((item) => item.id == button.dataset.editCategory)));
  document.querySelectorAll('[data-delete-category]').forEach((button) => button.onclick = () => removeCategory(button.dataset.deleteCategory));
}

function categoryCard(category) {
  return `<article class="item-card"><span class="color-swatch" style="--dot:${category.color}"></span><h3>${escapeHtml(category.name)}</h3><p>${escapeHtml(category.description || '')}</p><small>${category.project_count || 0} ${t.common.subcategoriesCount}</small><strong>${category.task_count || 0} ${t.common.tasksCount}</strong><div class="row-actions"><button data-edit-category="${category.id}">${UI.icon('edit')}</button><button data-delete-category="${category.id}">${UI.icon('trash')}</button></div></article>`;
}

function openCategoryModal(category = null) {
  lastFocusedElement = document.activeElement;
  const isEdit = Boolean(category);
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="category-form" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${isEdit ? t.titles.editCategory : t.titles.addCategory}</h2><button type="button" data-close>&times;</button></div>
    <div class="form-grid">
      <label>${t.fields.name}<input required name="name" value="${escapeAttr(category?.name || '')}" /></label>
      <label>${t.fields.color}<input type="color" name="color" value="${category?.color || '#2f80ed'}" /></label>
      <label>${t.fields.sortOrder}<input type="number" name="sort_order" value="${escapeAttr(category?.sort_order || 0)}" /></label>
      <label class="wide">${t.fields.description}<textarea name="description">${escapeHtml(category?.description || '')}</textarea></label>
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>${t.common.cancel}</button><button class="primary">${UI.icon('save')}${t.common.save}</button></div>
  </form></div>`;
  document.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeModal);
  document.getElementById('category-form').onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    if (!body.name.trim()) return UI.toast(t.messages.requiredName);
    isEdit ? await Api.updateCategory(category.id, body) : await Api.createCategory(body);
    closeModal();
    await loadAll();
    renderView();
    UI.toast(t.messages.saved);
  };
}

async function removeCategory(id) {
  await Api.deleteCategory(id);
  await loadAll();
  renderView();
  UI.toast(t.messages.deleted);
}

function renderProjects() {
  setHeader(t.titles.projects, t.subtitles.projects);
  document.getElementById('toolbar-actions').innerHTML = `<button class="primary" id="add-project">${UI.icon('plus')}${t.titles.addProject}</button>`;
  document.getElementById('content').innerHTML = `<div class="cards-list">${state.projects.map(projectCard).join('')}</div>`;
  document.getElementById('add-project').onclick = () => openEntityModal('project');
  document.querySelectorAll('[data-edit-project]').forEach((button) => button.onclick = () => openEntityModal('project', state.projects.find((item) => item.id == button.dataset.editProject)));
  document.querySelectorAll('[data-delete-project]').forEach((button) => button.onclick = () => removeEntity('project', button.dataset.deleteProject));
}

function projectCard(project) {
  return `<article class="item-card"><span class="color-swatch" style="--dot:${project.color}"></span><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.category_name || '')}</p><small>${escapeHtml(project.description || '')}</small><strong>${project.task_count || 0} ${t.common.tasksCount}</strong><div class="row-actions"><button data-edit-project="${project.id}">${UI.icon('edit')}</button><button data-delete-project="${project.id}">${UI.icon('trash')}</button></div></article>`;
}

function renderContacts() {
  setHeader(t.titles.contacts, t.subtitles.contacts);
  document.getElementById('toolbar-actions').innerHTML = `<button class="primary" id="add-contact">${UI.icon('plus')}${t.titles.addContact}</button>`;
  document.getElementById('content').innerHTML = `<div class="cards-list">${state.contacts.map(contactCard).join('') || `<div class="panel">${t.common.empty}</div>`}</div>`;
  document.getElementById('add-contact').onclick = () => openEntityModal('contact');
  document.querySelectorAll('[data-edit-contact]').forEach((button) => button.onclick = () => openEntityModal('contact', state.contacts.find((item) => item.id == button.dataset.editContact)));
  document.querySelectorAll('[data-delete-contact]').forEach((button) => button.onclick = () => removeEntity('contact', button.dataset.deleteContact));
}

function contactCard(contact) {
  return `<article class="item-card"><h3>${escapeHtml(contact.name)}</h3><p>${escapeHtml(contact.phone || '')}<br>${escapeHtml(contact.email || '')}</p><small>${escapeHtml(contact.notes || '')}</small><strong>${contact.task_count || 0} ${t.common.relatedTasks}</strong><div class="row-actions"><button data-edit-contact="${contact.id}">${UI.icon('edit')}</button><button data-delete-contact="${contact.id}">${UI.icon('trash')}</button></div></article>`;
}

function openEntityModal(type, entity = null) {
  lastFocusedElement = document.activeElement;
  const isProject = type === 'project';
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="entity-form" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${isProject ? t.titles.addProject : t.titles.addContact}</h2><button type="button" data-close>&times;</button></div>
    <div class="form-grid">
      <label>${t.fields.name}<input required name="name" value="${escapeAttr(entity?.name || '')}" /></label>
      ${isProject ? `<label>${t.fields.category}<select name="category_id"><option value="">${t.common.choose}</option>${options(state.categories, entity?.category_id)}</select></label>` : ''}
      ${isProject ? `<label>${t.fields.color}<input type="color" name="color" value="${entity?.color || '#2f80ed'}" /></label><label class="wide">${t.fields.description}<textarea name="description">${escapeHtml(entity?.description || '')}</textarea></label>` : `<label>${t.fields.phone}<input name="phone" value="${escapeAttr(entity?.phone || '')}" /></label><label>${t.fields.email}<input type="email" name="email" value="${escapeAttr(entity?.email || '')}" /></label><label class="wide">${t.fields.notes}<textarea name="notes">${escapeHtml(entity?.notes || '')}</textarea></label>`}
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>${t.common.cancel}</button><button class="primary">${t.common.save}</button></div>
  </form></div>`;
  document.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeModal);
  document.getElementById('entity-form').onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    const api = isProject ? ['createProject', 'updateProject'] : ['createContact', 'updateContact'];
    entity ? await Api[api[1]](entity.id, body) : await Api[api[0]](body);
    closeModal();
    await loadAll();
    renderView();
  };
}

async function removeEntity(type, id) {
  await (type === 'project' ? Api.deleteProject(id) : Api.deleteContact(id));
  await loadAll();
  renderView();
}

function renderCustomers() {
  setHeader(t.titles.customers, t.subtitles.customers);
  document.getElementById('toolbar-actions').innerHTML = `<button class="primary" id="add-customer">${UI.icon('plus')}${t.titles.addCustomer}</button>`;
  document.getElementById('content').innerHTML = `<div class="cards-list">${state.customers.map(customerCard).join('') || `<div class="panel">${t.common.empty}</div>`}</div>`;
  document.getElementById('add-customer').onclick = () => openCustomerModal();
  document.querySelectorAll('[data-edit-customer]').forEach((button) => button.onclick = () => openCustomerModal(state.customers.find((item) => item.id == button.dataset.editCustomer)));
  document.querySelectorAll('[data-delete-customer]').forEach((button) => button.onclick = () => removeCustomer(button.dataset.deleteCustomer));
}

function customerCard(customer) {
  return `<article class="item-card customer-card">
    <div class="customer-card-head"><h3>${escapeHtml(customer.name)}</h3><span class="stage-badge">${t.customerStage[customer.stage] || customer.stage}</span></div>
    <p>${escapeHtml(customer.deal_description || '')}</p>
    <strong>${formatMoney(customer.price)}</strong>
    <small>${escapeHtml(customer.contact_person || '')}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ''}${customer.email ? `<br>${escapeHtml(customer.email)}` : ''}</small>
    <small>${escapeHtml(customer.notes || '')}</small>
    <div class="row-actions"><button data-edit-customer="${customer.id}">${UI.icon('edit')}</button><button data-delete-customer="${customer.id}">${UI.icon('trash')}</button></div>
  </article>`;
}

function openCustomerModal(customer = null) {
  lastFocusedElement = document.activeElement;
  const isEdit = Boolean(customer);
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="customer-form" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${isEdit ? t.titles.editCustomer : t.titles.addCustomer}</h2><button type="button" data-close>&times;</button></div>
    <div class="form-grid">
      <label>${t.fields.customerName}<input required name="name" value="${escapeAttr(customer?.name || '')}" /></label>
      <label>${t.fields.dealStage}<select name="stage">${enumOptions(t.customerStage, customer?.stage || 'quote')}</select></label>
      <label>${t.fields.price}<input type="number" min="0" step="0.01" name="price" value="${escapeAttr(customer?.price || 0)}" /></label>
      <label>${t.fields.contactPerson}<input name="contact_person" value="${escapeAttr(customer?.contact_person || '')}" /></label>
      <label>${t.fields.phone}<input name="phone" value="${escapeAttr(customer?.phone || '')}" /></label>
      <label>${t.fields.email}<input type="email" name="email" value="${escapeAttr(customer?.email || '')}" /></label>
      <label class="wide">${t.fields.dealDescription}<textarea name="deal_description">${escapeHtml(customer?.deal_description || '')}</textarea></label>
      <label class="wide">${t.fields.notes}<textarea name="notes">${escapeHtml(customer?.notes || '')}</textarea></label>
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>${t.common.cancel}</button><button class="primary">${UI.icon('save')}${t.common.save}</button></div>
  </form></div>`;
  document.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeModal);
  document.getElementById('customer-form').onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    if (!body.name.trim()) return UI.toast(t.messages.requiredName);
    isEdit ? await Api.updateCustomer(customer.id, body) : await Api.createCustomer(body);
    closeModal();
    await loadAll();
    renderView();
    UI.toast(t.messages.saved);
  };
}

async function removeCustomer(id) {
  await Api.deleteCustomer(id);
  await loadAll();
  renderView();
  UI.toast(t.messages.deleted);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })} ${t.common.currency}`;
}

function renderSettings() {
  setHeader(t.titles.settings, t.subtitles.settings);
  document.getElementById('toolbar-actions').innerHTML = '';
  document.getElementById('content').innerHTML = `
    <div class="settings-grid">
      <button class="settings-card" data-theme="light">${t.settings.lightMode}</button>
      <button class="settings-card" data-theme="dark">${t.settings.darkMode}</button>
      <button class="settings-card" id="backup">${t.settings.backup}</button>
      <button class="settings-card" id="restore">${t.settings.restore}</button>
      <button class="settings-card" id="export">${t.settings.exportCsv}</button>
      <button class="settings-card" id="import">${t.settings.importCsv}</button>
    </div>
    <div class="panel settings-section">
      <div class="section-head"><h2>${t.settings.displayTitle}</h2></div>
      <div class="dashboard-options">
        <label class="display-option">${t.settings.density}<select id="density-select">
          <option value="compact" ${state.prefs.density === 'compact' ? 'selected' : ''}>${t.settings.densityCompact}</option>
          <option value="normal" ${!state.prefs.density || state.prefs.density === 'normal' ? 'selected' : ''}>${t.settings.densityNormal}</option>
          <option value="spacious" ${state.prefs.density === 'spacious' ? 'selected' : ''}>${t.settings.densitySpacious}</option>
        </select></label>
        <label class="display-option">${t.settings.fontSize}<select id="font-size-select">
          <option value="normal" ${state.prefs.fontSize !== 'large' ? 'selected' : ''}>${t.settings.fontNormal}</option>
          <option value="large" ${state.prefs.fontSize === 'large' ? 'selected' : ''}>${t.settings.fontLarge}</option>
        </select></label>
        <label class="display-option">${t.settings.homeView}<select id="home-view-select">${NAV_KEYS.map((key) => `<option value="${key}" ${state.prefs.homeView === key ? 'selected' : ''}>${t.nav[key]}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="panel settings-section">
      <div class="section-head"><h2>${t.settings.sidebarTitle}</h2></div>
      <p class="settings-hint">${t.settings.sidebarSubtitle}</p>
      <div class="dashboard-options-ordered">${sidebarOrderList().map((key, index, arr) => sidebarOption(key, index, arr.length)).join('')}</div>
    </div>
    <div class="panel settings-section">
      <div class="section-head"><h2>${t.titles.priorities}</h2><button class="primary" id="add-priority">${UI.icon('plus')}${t.titles.addPriority}</button></div>
      <div class="cards-list compact-list">${state.priorities.map(priorityCard).join('') || t.common.empty}</div>
    </div>
    <div class="panel settings-section">
      <div class="section-head"><h2>${t.titles.statuses}</h2><button class="primary" id="add-status">${UI.icon('plus')}${t.titles.addStatus}</button></div>
      <div class="cards-list compact-list">${state.statuses.map(statusCard).join('') || t.common.empty}</div>
    </div>`;
  document.querySelectorAll('[data-theme]').forEach((button) => button.onclick = async () => {
    await Api.setSetting('theme', button.dataset.theme);
    await loadAll();
    renderView();
  });
  document.getElementById('backup').onclick = backupDb;
  document.getElementById('restore').onclick = restoreDb;
  document.getElementById('export').onclick = exportCsv;
  document.getElementById('import').onclick = importCsv;
  document.getElementById('density-select').onchange = (event) => {
    state.prefs.density = event.target.value;
    persistPreferences();
    applyPreferenceStyles();
  };
  document.getElementById('font-size-select').onchange = (event) => {
    state.prefs.fontSize = event.target.value;
    persistPreferences();
    applyPreferenceStyles();
  };
  document.getElementById('home-view-select').onchange = (event) => {
    state.prefs.homeView = event.target.value;
    persistPreferences();
  };
  bindSidebarOrderControls();
  document.getElementById('add-priority').onclick = () => openPriorityModal();
  document.querySelectorAll('[data-edit-priority]').forEach((button) => button.onclick = () => openPriorityModal(state.priorities.find((item) => item.id == button.dataset.editPriority)));
  document.querySelectorAll('[data-delete-priority]').forEach((button) => button.onclick = () => removePriority(button.dataset.deletePriority));
  document.getElementById('add-status').onclick = () => openStatusModal();
  document.querySelectorAll('[data-edit-status]').forEach((button) => button.onclick = () => openStatusModal(state.statuses.find((item) => item.id == button.dataset.editStatus)));
  document.querySelectorAll('[data-delete-status]').forEach((button) => button.onclick = () => removeStatus(button.dataset.deleteStatus));
}

function sidebarOption(key, index, total) {
  const hidden = (state.prefs.sidebarHidden || []).includes(key);
  const isSettings = key === 'settings';
  return `<div class="dashboard-option-row">
    <label class="dashboard-option"><input type="checkbox" data-sidebar-visible="${key}" ${hidden ? '' : 'checked'} ${isSettings ? 'disabled' : ''} /> <span>${escapeHtml(t.nav[key])}</span></label>
    <div class="order-buttons">
      <button type="button" class="icon-mini" data-move-sidebar="${key}" data-dir="up" ${index === 0 ? 'disabled' : ''}>${UI.icon('up')}</button>
      <button type="button" class="icon-mini" data-move-sidebar="${key}" data-dir="down" ${index === total - 1 ? 'disabled' : ''}>${UI.icon('down')}</button>
    </div>
  </div>`;
}

function bindSidebarOrderControls() {
  document.querySelectorAll('[data-sidebar-visible]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.sidebarVisible;
      const hidden = new Set(state.prefs.sidebarHidden || []);
      if (checkbox.checked) hidden.delete(key); else hidden.add(key);
      state.prefs.sidebarHidden = [...hidden];
      persistPreferences();
      renderSidebarNav();
    });
  });
  document.querySelectorAll('[data-move-sidebar]').forEach((button) => {
    button.addEventListener('click', () => {
      const order = sidebarOrderList();
      const idx = order.indexOf(button.dataset.moveSidebar);
      const target = button.dataset.dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= order.length) return;
      [order[idx], order[target]] = [order[target], order[idx]];
      state.prefs.sidebarOrder = order;
      persistPreferences();
      renderSidebarNav();
      renderSettings();
    });
  });
}

function priorityCard(priority) {
  return `<article class="item-card compact-card"><span class="color-swatch" style="--dot:${priority.color}"></span><h3>${escapeHtml(priority.name)}</h3><small>${escapeHtml(priority.key)} · ${priority.task_count || 0} ${t.common.tasksCount}</small><div class="row-actions"><button data-edit-priority="${priority.id}">${UI.icon('edit')}</button><button data-delete-priority="${priority.id}">${UI.icon('trash')}</button></div></article>`;
}

function openPriorityModal(priority = null) {
  lastFocusedElement = document.activeElement;
  const isEdit = Boolean(priority);
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="priority-form" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${isEdit ? t.titles.editPriority : t.titles.addPriority}</h2><button type="button" data-close>&times;</button></div>
    <div class="form-grid">
      <label>${t.fields.name}<input required name="name" value="${escapeAttr(priority?.name || '')}" /></label>
      <label>${t.fields.key}<input name="key" value="${escapeAttr(priority?.key || '')}" /></label>
      <label>${t.fields.color}<input type="color" name="color" value="${priority?.color || '#2f80ed'}" /></label>
      <label>${t.fields.sortOrder}<input type="number" name="sort_order" value="${escapeAttr(priority?.sort_order || 0)}" /></label>
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>${t.common.cancel}</button><button class="primary">${UI.icon('save')}${t.common.save}</button></div>
  </form></div>`;
  document.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeModal);
  document.getElementById('priority-form').onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    if (!body.name.trim()) return UI.toast(t.messages.requiredName);
    isEdit ? await Api.updatePriority(priority.id, body) : await Api.createPriority(body);
    closeModal();
    await loadAll();
    renderView();
    UI.toast(t.messages.saved);
  };
}

async function removePriority(id) {
  await Api.deletePriority(id);
  await loadAll();
  renderView();
  UI.toast(t.messages.deleted);
}

function statusCard(status) {
  return `<article class="item-card compact-card"><span class="color-swatch" style="--dot:${status.color}"></span><h3>${escapeHtml(status.name)}</h3><small>${escapeHtml(status.key)}${status.is_done ? ` · ${t.fields.isDone}` : ''} · ${status.task_count || 0} ${t.common.tasksCount}</small><div class="row-actions"><button data-edit-status="${status.id}">${UI.icon('edit')}</button><button data-delete-status="${status.id}">${UI.icon('trash')}</button></div></article>`;
}

function openStatusModal(status = null) {
  lastFocusedElement = document.activeElement;
  const isEdit = Boolean(status);
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="status-form" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${isEdit ? t.titles.editStatus : t.titles.addStatus}</h2><button type="button" data-close>&times;</button></div>
    <div class="form-grid">
      <label>${t.fields.name}<input required name="name" value="${escapeAttr(status?.name || '')}" /></label>
      <label>${t.fields.key}<input name="key" value="${escapeAttr(status?.key || '')}" /></label>
      <label>${t.fields.color}<input type="color" name="color" value="${status?.color || '#2f80ed'}" /></label>
      <label>${t.fields.sortOrder}<input type="number" name="sort_order" value="${escapeAttr(status?.sort_order ?? 0)}" /></label>
      <label class="check-inline"><input type="checkbox" name="is_done" ${status?.is_done ? 'checked' : ''} />${t.fields.isDone}</label>
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>${t.common.cancel}</button><button class="primary">${UI.icon('save')}${t.common.save}</button></div>
  </form></div>`;
  document.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeModal);
  document.getElementById('status-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const body = Object.fromEntries(form.entries());
    body.is_done = form.get('is_done') ? '1' : '';
    if (!body.name.trim()) return UI.toast(t.messages.requiredName);
    isEdit ? await Api.updateStatus(status.id, body) : await Api.createStatus(body);
    closeModal();
    await loadAll();
    renderView();
    UI.toast(t.messages.saved);
  };
}

async function removeStatus(id) {
  await Api.deleteStatus(id);
  await loadAll();
  renderView();
  UI.toast(t.messages.deleted);
}

async function backupDb() {
  const destination = await window.taskflow.saveFile({ defaultPath: 'taskflow-backup.sqlite', filters: [{ name: 'SQLite', extensions: ['sqlite'] }] });
  if (destination) {
    await Api.backup(destination);
    UI.toast(t.messages.backupDone);
  }
}

async function restoreDb() {
  const source = await window.taskflow.openFile({ filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }] });
  if (source) {
    await Api.restore(source);
    UI.toast(t.messages.restoreDone);
  }
}

async function exportCsv() {
  const destination = await window.taskflow.saveFile({ defaultPath: 'taskflow-tasks.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (destination) {
    await Api.exportCsv(destination);
    UI.toast(t.messages.exportDone);
  }
}
async function importCsv() {
  const source = await window.taskflow.openFile({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (source) {
    await Api.importCsv(source);
    await loadAll();
    renderView();
    UI.toast(t.messages.importDone);
  }
}

function statCard(label, value, tone) {
  return `<div class="stat ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
}

function chartPanel(title, rows) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return `<div class="panel"><h2>${title}</h2><div class="bars">${rows.map((row) => `<div class="bar-row"><span>${escapeHtml(labelForChart(row.label))}</span><div><i style="width:${(row.value / max) * 100}%"></i></div><b>${row.value}</b></div>`).join('') || t.common.empty}</div></div>`;
}

function recentActivityPanel(rows) {
  return `<div class="panel"><h2>${t.titles.recentActivity}</h2><div class="activity">${rows.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(statusLabel(item.status))} &middot; ${UI.formatDate(item.updated_at)}</span></div>`).join('') || t.common.empty}</div></div>`;
}

function labelForChart(label) {
  if (label === '__NO_PROJECT__') return t.common.noProject;
  if (label === '__NO_CATEGORY__') return t.common.noCategory;
  return priorityLabel(label) || label;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  if (lastFocusedElement && document.contains(lastFocusedElement)) lastFocusedElement.focus();
  lastFocusedElement = null;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function bindGlobalUiHandlers() {
  document.addEventListener('click', (event) => {
    if (event.target.classList && event.target.classList.contains('modal-backdrop')) closeModal();
  });
}

function bindGlobalShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (!document.querySelector('.app-shell')) return;
    const modalOpen = document.querySelector('.modal-backdrop');
    if (event.key === 'Escape') {
      if (modalOpen) {
        event.preventDefault();
        closeModal();
      }
      return;
    }
    if (modalOpen) {
      if (event.key === 'Tab') trapFocus(event, modalOpen);
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        modalOpen.querySelector('form')?.requestSubmit();
      }
      return;
    }
    if (event.key === '?' && !isTypingTarget(event.target)) {
      event.preventDefault();
      openShortcutsModal();
      return;
    }
    if (state.view === 'tasks' && !isTypingTarget(event.target) && (event.key === 'n' || event.key === 'N' || event.key === '/')) {
      event.preventDefault();
      document.getElementById('quick-add-input')?.focus();
    }
  });
}

function trapFocus(event, container) {
  const focusable = [...container.querySelectorAll('button, input, select, textarea, a[href]')].filter((el) => !el.disabled && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openShortcutsModal() {
  lastFocusedElement = document.activeElement;
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal shortcuts-modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${t.shortcuts.title}</h2><button type="button" data-close>&times;</button></div>
    <ul class="shortcuts-list">
      <li><kbd>N</kbd><span>${t.shortcuts.quickAdd}</span></li>
      <li><kbd>Esc</kbd><span>${t.shortcuts.closeModal}</span></li>
      <li><kbd>Ctrl</kbd> + <kbd>Enter</kbd><span>${t.shortcuts.saveModal}</span></li>
      <li><kbd>?</kbd><span>${t.shortcuts.help}</span></li>
    </ul>
  </div></div>`;
  document.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeModal);
}

function projectsForCategory(categoryId) {
  if (!categoryId) return state.projects;
  return state.projects.filter((project) => String(project.category_id || '') === String(categoryId));
}

function priorityOptions(selected) {
  return state.priorities.map((item) => `<option value="${escapeAttr(item.key)}" ${item.key === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
}

function priorityLabel(key) {
  return state.priorities.find((item) => item.key === key)?.name || t.priority[key] || key;
}

function defaultPriorityKey() {
  return state.priorities[0]?.key || 'medium';
}

function statusOptions(selected) {
  return state.statuses.map((item) => `<option value="${escapeAttr(item.key)}" ${item.key === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
}

function statusLabel(key) {
  return state.statuses.find((item) => item.key === key)?.name || t.status[key] || key;
}

function defaultStatusKey() {
  return state.statuses.find((item) => !item.is_done)?.key || state.statuses[0]?.key || 'open';
}

function defaultDoneKey() {
  return state.statuses.find((item) => item.is_done)?.key || 'completed';
}

function doneStatusKeys() {
  return state.statuses.filter((item) => item.is_done).map((item) => item.key);
}

function options(items, selected) {
  return items.map((item) => `<option value="${item.id}" ${item.id == selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
}

function enumOptions(items, selected) {
  return Object.entries(items).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function sortOptions() {
  const optionsMap = { priority: t.fields.priority, created_at: t.fields.createdDate, due_date: t.fields.dueDate, project: t.fields.project, category: t.fields.category };
  const visibleSortFields = SORT_FIELDS.filter((field) => state.visibleTaskColumns.includes(field));
  const fields = visibleSortFields.length ? visibleSortFields : SORT_FIELDS;
  if (!fields.includes(state.filters.sort_by)) state.filters.sort_by = fields[0];
  return fields
    .map((field) => `<option value="${field}" ${field === state.filters.sort_by ? 'selected' : ''}>${t.fields.sortBy}: ${optionsMap[field]}</option>`).join('');
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
