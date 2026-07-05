const t = window.I18N;

const TASK_COLUMNS = ['status', 'priority', 'name', 'category', 'project', 'contact', 'due_date', 'created_at', 'actions'];
const DEFAULT_TASK_COLUMNS = ['status', 'priority', 'name', 'category', 'project', 'contact', 'due_date', 'created_at', 'actions'];

const state = {
  view: 'tasks',
  tasks: [],
  projects: [],
  categories: [],
  contacts: [],
  settings: {},
  filters: { sort_by: 'created_at', sort_dir: 'desc' },
  visibleTaskColumns: loadVisibleTaskColumns(),
  showColumnPicker: false,
  editingTask: null
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  window.addEventListener('taskflow:auth-required', renderLogin);
  if (!Api.token) return renderLogin();
  renderShell();
  await loadAll();
  renderView();
}

async function loadAll() {
  const query = new URLSearchParams(Object.entries(state.filters).filter(([, value]) => value)).toString();
  const [tasks, projects, categories, contacts, settings] = await Promise.all([
    Api.tasks(query ? `?${query}` : ''),
    Api.projects(),
    Api.categories(),
    Api.contacts(),
    Api.settings()
  ]);
  Object.assign(state, { tasks, projects, categories, contacts, settings });
  document.body.classList.toggle('dark', settings.theme === 'dark');
}

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <main class="login-screen">
      <form id="login-form" class="login-card">
        <div class="brand login-brand"><span class="brand-mark">${UI.icon('check')}</span><strong>${t.appName}</strong></div>
        <h1>${t.auth.title}</h1>
        <p>${t.auth.subtitle}</p>
        <label>${t.auth.password}<input type="password" name="password" autocomplete="current-password" required autofocus /></label>
        <button class="primary">${t.auth.login}</button>
        <small>${t.auth.initialPasswordHint}</small>
      </form>
    </main>
  `;
  document.getElementById('login-form').onsubmit = async (event) => {
    event.preventDefault();
    const password = new FormData(event.target).get('password');
    try {
      const result = await Api.login(password);
      Api.setToken(result.token);
      renderShell();
      await loadAll();
      renderView();
    } catch (error) {
      UI.toast(t.auth.invalidPassword);
    }
  };
}
function renderShell() {
  document.getElementById('app').innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${UI.icon('check')}</span><strong>${t.appName}</strong></div>
      <nav>${navItem('dashboard')}${navItem('tasks')}${navItem('categories')}${navItem('projects')}${navItem('contacts')}${navItem('settings')}</nav>
    </aside>
    <main class="main">
      <header class="toolbar">
        <div><h1 id="page-title"></h1><p id="page-subtitle"></p></div>
        <div id="toolbar-actions" class="toolbar-actions"></div><button class="icon-command" id="logout-button" title="${t.auth.logout}">${UI.icon('settings')}</button>
      </header>
      <section id="content" class="content"></section>
    </main>
    <div id="modal-root"></div>
  `;
  document.getElementById('logout-button').onclick = async () => {
    await Api.logout().catch(() => null);
    Api.setToken('');
    renderLogin();
  };
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.nav;
      renderView();
    });
  });
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
  if (state.view === 'contacts') renderContacts();
  if (state.view === 'settings') renderSettings();
}

function renderTasks() {
  const visibleColumns = TASK_COLUMNS.filter((column) => state.visibleTaskColumns.includes(column));
  document.getElementById('content').innerHTML = `
    ${state.showColumnPicker ? columnPicker() : ''}
    <div class="panel filters">
      <input id="search" placeholder="${t.common.search}" value="${state.filters.search || ''}" />
      <select id="category-filter"><option value="">${t.fields.category}: ${t.common.all}</option>${options(state.categories, state.filters.category_id)}</select>
      <select id="project-filter"><option value="">${t.fields.project}: ${t.common.all}</option>${options(projectsForCategory(state.filters.category_id), state.filters.project_id)}</select>
      <select id="priority-filter"><option value="">${t.fields.priority}: ${t.common.all}</option>${enumOptions(t.priority, state.filters.priority)}</select>
      <select id="status-filter"><option value="">${t.fields.status}: ${t.common.all}</option>${enumOptions(t.status, state.filters.status)}</select>
      <input id="from-date" type="date" value="${state.filters.from_date || ''}" />
      <input id="to-date" type="date" value="${state.filters.to_date || ''}" />
      <select id="sort-by">${sortOptions()}</select>
    </div>
    <div class="panel table-panel">
      <table>
        <thead><tr>${visibleColumns.map((column) => `<th>${taskColumnLabel(column)}</th>`).join('')}</tr></thead>
        <tbody>${state.tasks.map((task) => taskRow(task, visibleColumns)).join('') || emptyRow(visibleColumns.length)}</tbody>
      </table>
    </div>
  `;
  bindColumnPicker();
  bindFilters();
  bindTaskActions();
}

function columnPicker() {
  return `<div class="panel column-picker">
    <strong>${t.titles.visibleColumns}</strong>
    <div>${TASK_COLUMNS.map((column) => `<label class="check-option"><input type="checkbox" data-column="${column}" ${state.visibleTaskColumns.includes(column) ? 'checked' : ''} />${taskColumnLabel(column)}</label>`).join('')}</div>
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

function taskRow(task, columns) {
  return `<tr>${columns.map((column) => taskCell(task, column)).join('')}</tr>`;
}

function taskCell(task, column) {
  const cells = {
    status: `<td><span class="chip status-${task.status}">${t.status[task.status]}</span></td>`,
    priority: `<td><span class="chip priority-${task.priority}">${t.priority[task.priority]}</span></td>`,
    name: `<td><input class="quick-task-name" data-quick-name="${task.id}" value="${escapeAttr(task.name)}" aria-label="${t.fields.taskName}" /><small>${escapeHtml(task.tags || '')}</small></td>`,
    category: `<td><select class="quick-category" data-quick-category="${task.id}" aria-label="${t.fields.category}"><option value="">${t.common.choose}</option>${options(state.categories, task.category_id)}</select></td>`,
    project: `<td><span class="project-dot" style="--dot:${task.project_color || '#cbd5e1'}"></span>${escapeHtml(task.project_name || '')}</td>`,
    contact: `<td>${escapeHtml(task.contact_name || '')}</td>`,
    due_date: `<td>${UI.formatDate(task.due_date)}</td>`,
    created_at: `<td>${UI.formatDate(task.created_at)}</td>`,
    actions: `<td><div class="row-actions">
      <button title="${t.common.edit}" data-edit="${task.id}">${UI.icon('edit')}</button>
      <button title="${t.common.complete}" data-complete="${task.id}">${UI.icon('check')}</button>
      <button title="${t.common.duplicate}" data-duplicate="${task.id}">${UI.icon('copy')}</button>
      <button title="${t.common.delete}" data-delete="${task.id}">${UI.icon('trash')}</button>
    </div></td>`
  };
  return cells[column] || '<td></td>';
}

function bindColumnPicker() {
  document.querySelectorAll('[data-column]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const selected = [...document.querySelectorAll('[data-column]:checked')].map((item) => item.dataset.column);
      state.visibleTaskColumns = selected.length ? selected : ['name'];
      localStorage.setItem('taskflow_task_columns', JSON.stringify(state.visibleTaskColumns));
      renderTasks();
    });
  });
}

function bindFilters() {
  const apply = async () => {
    state.filters = {
      search: document.getElementById('search').value,
      project_id: document.getElementById('project-filter').value,
      category_id: document.getElementById('category-filter').value,
      priority: document.getElementById('priority-filter').value,
      status: document.getElementById('status-filter').value,
      from_date: document.getElementById('from-date').value,
      to_date: document.getElementById('to-date').value,
      sort_by: document.getElementById('sort-by').value,
      sort_dir: 'desc'
    };
    await loadAll();
    renderTasks();
  };
  document.querySelectorAll('.filters input, .filters select').forEach((control) => control.addEventListener('input', debounce(apply, 250)));
}

function bindTaskActions() {
  document.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => openTaskModal(state.tasks.find((task) => task.id == button.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach((button) => button.onclick = () => removeTask(button.dataset.delete));
  document.querySelectorAll('[data-complete]').forEach((button) => button.onclick = () => mutateTask(() => Api.completeTask(button.dataset.complete)));
  document.querySelectorAll('[data-duplicate]').forEach((button) => button.onclick = () => mutateTask(() => Api.duplicateTask(button.dataset.duplicate)));
  document.querySelectorAll('[data-quick-name]').forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('change', () => quickUpdateTask(input.dataset.quickName, { name: input.value }));
  });
  document.querySelectorAll('[data-quick-category]').forEach((select) => {
    select.addEventListener('change', () => quickUpdateTask(select.dataset.quickCategory, { category_id: select.value, project_id: '' }));
  });
}

async function quickUpdateTask(id, patch) {
  const task = state.tasks.find((item) => String(item.id) === String(id));
  if (!task) return;
  const body = {
    name: task.name,
    description: task.description || '',
    project_id: task.project_id || '',
    category_id: task.category_id || '',
    contact_id: task.contact_id || '',
    priority: task.priority || 'medium',
    status: task.status || 'open',
    created_at: task.created_at || '',
    due_date: task.due_date || '',
    tags: task.tags || '',
    notes: task.notes || '',
    ...patch
  };
  if (!String(body.name || '').trim()) return UI.toast(t.messages.requiredTaskName);
  await Api.updateTask(id, body);
  await loadAll();
  renderTasks();
  UI.toast(t.messages.quickSaved);
}

function openTaskModal(task = null) {
  const isEdit = Boolean(task);
  const modal = document.getElementById('modal-root');
  modal.innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="task-form">
    <div class="modal-head"><h2>${isEdit ? t.titles.editTask : t.titles.addTask}</h2><div class="modal-head-actions"><button class="primary" type="submit">${UI.icon('save')}${t.common.save}</button><button type="button" data-close>&times;</button></div></div>
    <div class="form-grid">
      <label>${t.fields.taskName}<input required name="name" value="${escapeAttr(task?.name || '')}" /></label>
      <label>${t.fields.priority}<select name="priority">${enumOptions(t.priority, task?.priority || 'medium')}</select></label>
      <label>${t.fields.category}<select id="task-category" name="category_id"><option value="">${t.common.choose}</option>${options(state.categories, task?.category_id)}</select></label>
      <label>${t.fields.project}<select id="task-project" name="project_id"><option value="">${t.common.choose}</option>${options(projectsForCategory(task?.category_id), task?.project_id)}</select></label>
      <label>${t.fields.contact}<select name="contact_id"><option value="">${t.common.choose}</option>${options(state.contacts, task?.contact_id)}</select></label>
      <label>${t.fields.status}<select name="status">${enumOptions(t.status, task?.status || 'open')}</select></label>
      <label>${t.fields.createdDate}<input type="date" name="created_at" value="${UI.dateInput(task?.created_at || new Date())}" /></label>
      <label>${t.fields.dueDate}<input type="date" name="due_date" value="${UI.dateInput(task?.due_date)}" /></label>
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
  document.getElementById('task-form').onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    if (!body.name.trim()) return UI.toast(t.messages.requiredTaskName);
    if (isEdit) await Api.updateTask(task.id, body); else await Api.createTask(body);
    closeModal();
    await loadAll();
    renderView();
    UI.toast(t.messages.taskSaved);
  };
}

async function removeTask(id) {
  await Api.deleteTask(id);
  await loadAll();
  renderView();
  UI.toast(t.messages.deleted);
}

async function mutateTask(action) {
  await action();
  await loadAll();
  renderView();
}

function renderDashboard() {
  setHeader(t.titles.dashboard, t.subtitles.dashboard);
  Api.dashboard().then((data) => {
    const summary = data.summary || {};
    document.getElementById('content').innerHTML = `
      <div class="stats-grid">
        ${statCard(t.dashboard.openTasks, summary.open_tasks || 0, 'blue')}
        ${statCard(t.dashboard.completedTasks, summary.completed_tasks || 0, 'green')}
        ${statCard(t.dashboard.overdueTasks, summary.overdue_tasks || 0, 'red')}
        ${statCard(t.dashboard.todayTasks, summary.today_tasks || 0, 'amber')}
      </div>
      <div class="dashboard-grid">
        ${chartPanel(t.titles.tasksByPriority, data.byPriority)}
        ${chartPanel(t.titles.tasksByProject, data.byProject)}
        ${chartPanel(t.titles.tasksByCategory, data.byCategory)}
        <div class="panel"><h2>${t.titles.recentActivity}</h2><div class="activity">${data.recent.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><span>${t.status[item.status]} &middot; ${UI.formatDate(item.updated_at)}</span></div>`).join('') || t.common.empty}</div></div>
      </div>`;
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
  const isEdit = Boolean(category);
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="category-form">
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
  const isProject = type === 'project';
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal card-form" id="entity-form">
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

function labelForChart(label) {
  if (label === '__NO_PROJECT__') return t.common.noProject;
  if (label === '__NO_CATEGORY__') return t.common.noCategory;
  return t.priority[label] || label;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}


function projectsForCategory(categoryId) {
  if (!categoryId) return state.projects;
  return state.projects.filter((project) => String(project.category_id || '') === String(categoryId));
}

function loadVisibleTaskColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem('taskflow_task_columns') || '[]');
    const valid = saved.filter((column) => TASK_COLUMNS.includes(column));
    return valid.length ? valid : DEFAULT_TASK_COLUMNS;
  } catch (error) {
    return DEFAULT_TASK_COLUMNS;
  }
}

function options(items, selected) {
  return items.map((item) => `<option value="${item.id}" ${item.id == selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
}

function enumOptions(items, selected) {
  return Object.entries(items).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function sortOptions() {
  const optionsMap = { priority: t.fields.priority, created_at: t.fields.createdDate, due_date: t.fields.dueDate, project: t.fields.project, category: t.fields.category };
  return Object.entries(optionsMap).map(([value, label]) => `<option value="${value}" ${value === state.filters.sort_by ? 'selected' : ''}>${t.fields.sortBy}: ${label}</option>`).join('');
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="empty">${t.common.empty}</td></tr>`;
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



















