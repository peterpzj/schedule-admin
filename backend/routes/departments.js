const { createCrudRouter } = require('./_crud_factory');
module.exports = createCrudRouter('departments', {
  searchable: ['name', 'code'],
  sortable: ['id', 'name', 'code'],
  allowedFields: ['name', 'code'],
  entity: 'departments'
});
