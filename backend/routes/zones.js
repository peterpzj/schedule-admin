const { createCrudRouter } = require('./_crud_factory');
module.exports = createCrudRouter('zones', {
  searchable: ['name', 'code', 'campus_name'],
  sortable: ['id', 'name', 'code', 'campus_code', 'sort_order'],
  allowedFields: ['name', 'code', 'campus_code', 'campus_name', 'sort_order'],
  entity: 'zones'
});
