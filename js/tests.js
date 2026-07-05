const assert = require('assert');
const { validateTask } = require('../src/backend/validators/taskValidator');

assert.deepStrictEqual(validateTask({ name: '' }).errors.name, 'Task name is required');
assert.strictEqual(validateTask({ name: 'בדיקה' }).valid, true);

console.log('All tests passed');
