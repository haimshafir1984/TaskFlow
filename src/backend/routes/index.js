const express = require('express');
const createTaskController = require('../controllers/taskController');
const createCatalogController = require('../controllers/catalogController');
const createSettingsController = require('../controllers/settingsController');
const createAuthController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

function createRoutes(services) {
  const router = express.Router();
  const auth = createAuthController(services.authService);
  const tasks = createTaskController(services.taskService);
  const catalogs = createCatalogController(services.catalogService);
  const settings = createSettingsController(services.settingsService, services.taskService);

  router.post('/auth/login', auth.login);
  router.get('/auth/status', auth.status);
  router.post('/auth/logout', auth.logout);
  router.post('/auth/change-password', requireAuth(services.authService), auth.changePassword);

  router.use(requireAuth(services.authService));

  router.get('/dashboard', tasks.dashboard);
  router.get('/tasks', tasks.list);
  router.post('/tasks', tasks.create);
  router.put('/tasks/:id', tasks.update);
  router.delete('/tasks/:id', tasks.delete);
  router.post('/tasks/:id/complete', tasks.complete);
  router.post('/tasks/:id/duplicate', tasks.duplicate);

  router.get('/categories', catalogs.categories.list);
  router.post('/categories', catalogs.categories.create);
  router.put('/categories/:id', catalogs.categories.update);
  router.delete('/categories/:id', catalogs.categories.delete);

  router.get('/projects', catalogs.projects.list);
  router.post('/projects', catalogs.projects.create);
  router.put('/projects/:id', catalogs.projects.update);
  router.delete('/projects/:id', catalogs.projects.delete);

  router.get('/contacts', catalogs.contacts.list);
  router.post('/contacts', catalogs.contacts.create);
  router.put('/contacts/:id', catalogs.contacts.update);
  router.delete('/contacts/:id', catalogs.contacts.delete);

  router.get('/settings', settings.list);
  router.post('/settings', settings.set);
  router.post('/settings/backup', settings.backup);
  router.post('/settings/restore', settings.restore);
  router.post('/settings/export-csv', settings.exportCsv);
  router.post('/settings/import-csv', settings.importCsv);

  router.use((error, req, res, next) => {
    res.status(error.status || 500).json({ message: error.message, details: error.details || null });
  });

  return router;
}

module.exports = createRoutes;
