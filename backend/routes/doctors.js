const { createCrudRouter } = require('./_crud_factory');
module.exports = createCrudRouter('doctors', {
  searchable: ['name', 'work_id', 'department', 'title', 'other_title'],
  sortable: ['id', 'name', 'work_id', 'department', 'title', 'primary_campus'],
  allowedFields: ['name', 'work_id', 'department', 'title', 'other_title', 'primary_campus'],
  entity: 'doctors'
});
