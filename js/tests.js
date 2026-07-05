const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateTask } = require('../src/backend/validators/taskValidator');
const { startServer } = require('../src/backend/server');

async function run() {
  assert.deepStrictEqual(validateTask({ name: '' }).errors.name, 'Task name is required');
  assert.strictEqual(validateTask({ name: 'task' }).valid, true);

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-tests-'));
  const { server, port } = await startServer({ dataDir, host: '127.0.0.1' });
  try {
    const first = await register(port, 'user-a', '1');
    assert.strictEqual(first.status, 201);
    assert.strictEqual(first.body.user.username, 'user-a');

    const second = await register(port, 'user-b', '2');
    assert.strictEqual(second.status, 201);
    assert.strictEqual(second.body.user.username, 'user-b');

    const duplicate = await register(port, 'user-a', '3');
    assert.strictEqual(duplicate.status, 409);
    assert.strictEqual(duplicate.body.code, 'USERNAME_EXISTS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function register(port, username, password) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return { status: response.status, body: await response.json() };
}

run()
  .then(() => console.log('All tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
