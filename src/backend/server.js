const express = require('express');
const path = require('path');
const createRoutes = require('./routes');
const { initDatabase } = require('./database/db');
const TaskRepository = require('./repositories/taskRepository');
const ProjectRepository = require('./repositories/projectRepository');
const ContactRepository = require('./repositories/contactRepository');
const CustomerRepository = require('./repositories/customerRepository');
const CategoryRepository = require('./repositories/categoryRepository');
const PriorityRepository = require('./repositories/priorityRepository');
const StatusRepository = require('./repositories/statusRepository');
const PreferencesRepository = require('./repositories/preferencesRepository');
const TaskService = require('./services/taskService');
const CustomerService = require('./services/customerService');
const CatalogService = require('./services/catalogService');
const SettingsService = require('./services/settingsService');
const AuthService = require('./services/authService');
const PreferencesService = require('./services/preferencesService');

async function startServer({ dataDir, port = 0, host = '127.0.0.1' }) {
  const { db, dbPath } = await initDatabase(dataDir);
  const app = express();
  const frontendDir = path.join(__dirname, '..', 'frontend');
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    if (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.webmanifest') || req.path.endsWith('service-worker.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
    next();
  });
  app.use(express.static(frontendDir, {
    etag: false,
    lastModified: false,
    maxAge: 0
  }));

  const taskRepository = new TaskRepository(db);
  const projectRepository = new ProjectRepository(db);
  const contactRepository = new ContactRepository(db);
  const customerRepository = new CustomerRepository(db);
  const categoryRepository = new CategoryRepository(db);
  const priorityRepository = new PriorityRepository(db);
  const statusRepository = new StatusRepository(db);
  const preferencesRepository = new PreferencesRepository(db);
  const settingsService = new SettingsService(db, dbPath);
  const catalogService = new CatalogService(projectRepository, contactRepository, categoryRepository, priorityRepository, statusRepository);
  const services = {
    authService: new AuthService(db, catalogService),
    taskService: new TaskService(taskRepository, statusRepository),
    customerService: new CustomerService(customerRepository),
    catalogService,
    settingsService,
    preferencesService: new PreferencesService(preferencesRepository)
  };

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', createRoutes(services));
  app.use('/api', (error, req, res, next) => {
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || 'Server error',
      code: error.code || 'SERVER_ERROR'
    });
  });
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      resolve({ server, port: server.address().port, dbPath });
    });
  });
}

module.exports = { startServer };
