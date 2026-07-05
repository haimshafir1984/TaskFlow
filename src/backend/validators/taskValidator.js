const { PRIORITIES, STATUSES } = require('../../shared/constants');

function validateTask(payload) {
  const errors = {};
  if (!payload.name || !String(payload.name).trim()) errors.name = 'Task name is required';
  if (payload.priority && !PRIORITIES.includes(payload.priority)) errors.priority = 'Invalid priority';
  if (payload.status && !STATUSES.includes(payload.status)) errors.status = 'Invalid status';
  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = { validateTask };
