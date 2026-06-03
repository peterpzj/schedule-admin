const { createCrudRouter } = require('./_crud_factory');
module.exports = createCrudRouter('clinic_types', {
  searchable: ['name', 'code'],
  sortable: ['id', 'name', 'code', 'sort_order'],
  allowedFields: ['name', 'code', 'sort_order'],
  entity: 'clinic_types'
});
