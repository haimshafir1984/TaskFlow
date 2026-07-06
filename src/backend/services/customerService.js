class CustomerService {
  constructor(customerRepository) {
    this.customers = customerRepository;
  }

  list(userId) {
    return this.customers.list(userId);
  }

  create(userId, payload) {
    return this.customers.create(this.normalize(userId, payload));
  }

  update(userId, id, payload) {
    return this.customers.update(userId, id, this.normalize(userId, payload));
  }

  delete(userId, id) {
    return this.customers.deleteForUser(userId, id);
  }

  normalize(userId, payload) {
    const name = String(payload.name || '').trim();
    if (!name) {
      const error = new Error('Customer name is required');
      error.status = 422;
      error.code = 'CUSTOMER_NAME_REQUIRED';
      throw error;
    }
    const stage = ['quote', 'closed'].includes(payload.stage) ? payload.stage : 'quote';
    return {
      user_id: Number(userId),
      name,
      deal_description: String(payload.deal_description || '').trim(),
      stage,
      price: Number(payload.price || 0),
      contact_person: String(payload.contact_person || '').trim(),
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      notes: String(payload.notes || '').trim()
    };
  }
}

module.exports = CustomerService;
