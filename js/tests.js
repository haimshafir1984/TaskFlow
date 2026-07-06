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

    const customer = await api(port, first.body.token, '/customers', {
      method: 'POST',
      body: {
        name: 'Acme',
        deal_description: 'Website project',
        stage: 'quote',
        price: 12000,
        contact_person: 'Dana',
        phone: '050-0000000',
        email: 'dana@example.com',
        notes: 'Initial lead'
      }
    });
    assert.strictEqual(customer.status, 201);
    assert.strictEqual(customer.body.name, 'Acme');
    assert.strictEqual(customer.body.stage, 'quote');

    const updated = await api(port, first.body.token, `/customers/${customer.body.id}`, {
      method: 'PUT',
      body: { ...customer.body, stage: 'closed', price: 15000 }
    });
    assert.strictEqual(updated.status, 200);
    assert.strictEqual(updated.body.stage, 'closed');
    assert.strictEqual(updated.body.price, 15000);

    const list = await api(port, first.body.token, '/customers');
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.length, 1);

    const isolatedList = await api(port, second.body.token, '/customers');
    assert.strictEqual(isolatedList.status, 200);
    assert.strictEqual(isolatedList.body.length, 0);

    const deleted = await api(port, first.body.token, `/customers/${customer.body.id}`, { method: 'DELETE' });
    assert.strictEqual(deleted.status, 204);
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

async function api(port, token, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

run()
  .then(() => console.log('All tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
