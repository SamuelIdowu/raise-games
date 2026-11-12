import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthedRequest, AuthedUser } from './jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    return request.user;
  },
);
