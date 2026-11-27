import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { UploadsService } from './uploads.service';
import {
  presignUploadSchema,
  uploadIdParamSchema,
  uploadUrlQuerySchema,
  type PresignUploadRequest,
  type UploadIdParam,
  type UploadUrlQuery,
} from './uploads.schemas';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Step 1: presigned PUT to a private quarantine key (5 min, type + length signed). */
  @Post('presign')
  async presign(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(presignUploadSchema)) input: PresignUploadRequest,
  ) {
    await enforceRateLimit(`rl:uploads:presign:${user.sub}`, 20, 60_000);
    return this.uploads.presign(user.sub, input);
  }

  /** Step 2: server verifies bytes, strips EXIF, hashes, checks reuse. */
  @Post(':id/complete')
  @HttpCode(200)
  async complete(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(uploadIdParamSchema)) params: UploadIdParam,
  ) {
    await enforceRateLimit(`rl:uploads:complete:${user.sub}`, 20, 60_000);
    return this.uploads.complete(user.sub, params.id);
  }

  /** Signed 60s read URL; the bucket is never public. */
  @Get(':id/url')
  async url(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(uploadIdParamSchema)) params: UploadIdParam,
    @Query(new ZodValidationPipe(uploadUrlQuerySchema)) query: UploadUrlQuery,
  ) {
    await enforceRateLimit(`rl:uploads:url:${user.sub}`, 120, 60_000);
    return this.uploads.signedUrl(user.sub, user.role, params.id, query.variant);
  }
}
