export * as platform from './schema/platform';
export * as tenant from './schema/tenant';
export {
  platformDb,
  getTenantDb,
  getTenantSql,
  closeAll,
} from './client';
export {
  tenantSchemaName,
  provisionTenantSchema,
  dropTenantSchema,
  getTenant,
} from './tenant-router';
