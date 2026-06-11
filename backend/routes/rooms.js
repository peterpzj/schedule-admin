const { createCrudRouter } = require('./_crud_factory');
module.exports = createCrudRouter('rooms', {
  searchable: ['room_id', 'room_name', 'campus_name', 'zone_name', 'department'],
  sortable: ['id', 'room_id', 'campus_code', 'zone_code', 'department'],
  allowedFields: ['room_id', 'room_name', 'campus_code', 'campus_name', 'zone_code', 'zone_name', 'department'],
  entity: 'rooms'
});
