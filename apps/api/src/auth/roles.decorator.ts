import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './jwt-auth.guard';

export const ROLES_KEY = 'roles';

/** Restrict an endpoint to the given roles. Authentication is still required. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
