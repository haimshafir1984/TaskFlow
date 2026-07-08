function validateTask(payload, validStatuses) {
  const errors = {};
  if (!payload.name || !String(payload.name).trim()) errors.name = 'Task name is required';
  if (payload.status && Array.isArray(validStatuses) && !validStatuses.includes(payload.status)) errors.status = 'Invalid status';
  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = { validateTask };
