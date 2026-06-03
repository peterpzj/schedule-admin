const { createCrudRouter } = require('./_crud_factory');
module.exports = createCrudRouter('time_slots', {
  searchable: ['name', 'code', 'campus_name', 'clinic_type_name', 'period'],
  sortable: ['id', 'name', 'code', 'campus_code', 'clinic_type_code', 'period', 'sort_order'],
  allowedFields: ['name', 'code', 'campus_code', 'campus_name', 'clinic_type_code', 'clinic_type_name', 'period', 'start_time', 'end_time', 'sort_order'],
  entity: 'time_slots'
});
