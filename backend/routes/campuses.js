const { createCrudRouter } = require('./_crud_factory');
module.exports = createCrudRouter('campuses', {
  searchable: ['name', 'code'],
  sortable: ['id', 'name', 'code', 'sort_order'],
  allowedFields: ['name', 'code', 'sort_order'],
  entity: 'campuses'
});
