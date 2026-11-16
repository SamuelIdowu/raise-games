import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, count, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { UserRole } from '../auth/jwt-auth.guard';
import {
  FILE_STORAGE,
  ObjectTooLargeError,
  type FileStoragePort,
} from '../storage/file-storage.port';
import {
  ALLOWED_MIME,
  InvalidImageError,
  MAX_UPLOAD_BYTES,
  PHASH_SIMILAR_THRESHOLD,
  processProofImage,
} from './image-processing';
import type { PresignUploadRequest } from './uploads.schemas';

/** Statuses in which a match still takes result evidence. */
export const SUBMITTABLE_MATCH_STATES = [
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
] as const;

const PUT_URL_TTL_SEC = 300;
const READ_URL_TTL_SEC = 60;
const MAX_PENDING_PER_MATCH = 10;

export const UPLOAD_MESSAGES = {
  storageDown: 'Screenshot uploads are unavailable right now. Try again in a few minutes.',
  notParticipant: 'Match not found',
  matchClosed: 'This match is no longer accepting results.',
  alreadySubmitted: 'You have already submitted a result for this match.',
  badType: 'Upload a JPG, PNG or WebP image.',
  tooLarge: 'The screenshot is too large. The limit is 1 MB.',
  tooManyPending: 'Too many unfinished uploads for this match. Remove one and try again.',
  missingObject: 'Could not upload the screenshot. Check your connection and try again.',
  notAnImage: 'This file is not a supported image.',
  reused: 'This screenshot was already used for another match.',
} as const;

export interface UploadView {
  id: string;
  status: 'pending' | 'ready' | 'rejected';
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  flagged: boolean;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStoragePort) {}

  private requireStorage() {
    if (!this.storage.configured)
      throw new ServiceUnavailableException(UPLOAD_MESSAGES.storageDown);
  }

  /** Throws unless `userId` plays in `matchId` and the match still takes evidence from them. */
  private async assertCanAttach(userId: string, matchId: string) {
    const [row] = await db
      .select({
        status: schema.matches.status,
        sideId: schema.matchSides.id,
      })
      .from(schema.matches)
      .innerJoin(
        schema.matchSides,
        and(eq(schema.matchSides.matchId, schema.matches.id), eq(schema.matchSides.userId, userId)),
      )
      .where(eq(schema.matches.id, matchId))
      .limit(1);
    if (!row) throw new NotFoundException(UPLOAD_MESSAGES.notParticipant);
    if (!(SUBMITTABLE_MATCH_STATES as readonly string[]).includes(row.status)) {
      throw new ConflictException(UPLOAD_MESSAGES.matchClosed);
    }
    const [existing] = await db
      .select({ id: schema.resultSubmissions.id })
      .from(schema.resultSubmissions)
      .where(eq(schema.resultSubmissions.matchSideId, row.sideId))
      .limit(1);
    if (existing) throw new ConflictException(UPLOAD_MESSAGES.alreadySubmitted);
  }

  async presign(userId: string, input: PresignUploadRequest) {
    this.requireStorage();
    if (!(ALLOWED_MIME as readonly string[]).includes(input.contentType)) {
      throw new BadRequestException(UPLOAD_MESSAGES.badType);
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES)
      throw new PayloadTooLargeException(UPLOAD_MESSAGES.tooLarge);

    await this.assertCanAttach(userId, input.matchId);

    const [pendingRow] = await db
      .select({ pending: count() })
      .from(schema.uploads)
      .where(
        and(
          eq(schema.uploads.ownerId, userId),
          eq(schema.uploads.matchId, input.matchId),
          eq(schema.uploads.status, 'pending'),
        ),
      );
    if ((pendingRow?.pending ?? 0) >= MAX_PENDING_PER_MATCH)
      throw new ConflictException(UPLOAD_MESSAGES.tooManyPending);

    const id = uuidv7();
    const quarantineKey = `quarantine/${id}`;
    await db.insert(schema.uploads).values({
      id,
      ownerId: userId,
      matchId: input.matchId,
      purpose: input.purpose,
      status: 'pending',
      declaredMime: input.contentType,
      declaredSize: input.sizeBytes,
      quarantineKey,
    });

    const put = await this.storage.presignPut(
      quarantineKey,
      input.contentType,
      input.sizeBytes,
      PUT_URL_TTL_SEC,
    );
    return {
      uploadId: id,
      url: put.url,
      method: 'PUT' as const,
      headers: put.headers,
      expiresAt: put.expiresAt,
    };
  }

  async complete(userId: string, uploadId: string): Promise<UploadView> {
    this.requireStorage();
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, uploadId), eq(schema.uploads.ownerId, userId)))
      .limit(1);
    if (!upload) throw new NotFoundException('Upload not found');
    if (upload.status === 'ready') return toView(upload);
    if (upload.status === 'rejected')
      throw new ConflictException(rejectMessage(upload.rejectReason));
    if (upload.matchId) await this.assertCanAttach(userId, upload.matchId);

    let original: Buffer | null;
    try {
      original = await this.storage.getObject(upload.quarantineKey, MAX_UPLOAD_BYTES);
    } catch (err) {
      if (err instanceof ObjectTooLargeError) {
        await this.reject(upload.id, upload.quarantineKey, 'too_large');
        throw new PayloadTooLargeException(UPLOAD_MESSAGES.tooLarge);
      }
      throw err;
    }
    if (!original) throw new ConflictException(UPLOAD_MESSAGES.missingObject);

    let processed;
    try {
      processed = await processProofImage(original);
    } catch (err) {
      if (err instanceof InvalidImageError) {
        await this.reject(upload.id, upload.quarantineKey, 'not_an_image');
        throw new UnprocessableEntityException(UPLOAD_MESSAGES.notAnImage);
      }
      throw err;
    }

    // Exact reuse: identical bytes already attached to a different match.
    const [reused] = await db
      .select({ id: schema.uploads.id })
      .from(schema.uploads)
      .where(
        and(
          eq(schema.uploads.sha256, processed.sha256),
          eq(schema.uploads.status, 'ready'),
          sql`${schema.uploads.matchId} IS DISTINCT FROM ${upload.matchId}`,
        ),
      )
      .limit(1);
    if (reused) {
      await this.reject(upload.id, upload.quarantineKey, 'reused_screenshot', {
        reusedUploadId: reused.id,
        sha256: processed.sha256,
        phash: processed.phash,
      });
      this.logger.warn(`Upload ${upload.id} rejected: exact reuse of ${reused.id}`);
      throw new ConflictException(UPLOAD_MESSAGES.reused);
    }

    // Near-duplicate: same picture re-encoded or re-screenshotted, on another match
    // or uploaded by the opponent on this one. Accepted, but flagged for moderators.
    const similar = await db.execute<{ id: string; distance: number }>(sql`
      SELECT id, bit_count(('x' || phash)::bit(64) # ('x' || ${processed.phash})::bit(64))::int AS distance
      FROM uploads
      WHERE status = 'ready'
        AND phash IS NOT NULL
        AND id <> ${upload.id}
        AND (match_id IS DISTINCT FROM ${upload.matchId} OR owner_id <> ${userId})
      ORDER BY distance ASC
      LIMIT 1
    `);
    const nearest = similar.rows[0];
    const flag = nearest && nearest.distance <= PHASH_SIMILAR_THRESHOLD ? nearest : null;

    const storageKey = `proofs/${upload.id}.jpg`;
    const thumbKey = `proofs/${upload.id}_thumb.webp`;
    await this.storage.putObject(storageKey, processed.stored, 'image/jpeg');
    await this.storage.putObject(thumbKey, processed.thumb, 'image/webp');
    await this.storage.deleteObject(upload.quarantineKey).catch(() => undefined);

    const [updated] = await db
      .update(schema.uploads)
      .set({
        status: 'ready',
        storageKey,
        thumbKey,
        mime: 'image/jpeg',
        sizeBytes: processed.stored.byteLength,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        storedSha256: processed.storedSha256,
        phash: processed.phash,
        similarUploadId: flag?.id ?? null,
        similarDistance: flag?.distance ?? null,
        completedAt: new Date(),
      })
      .where(and(eq(schema.uploads.id, upload.id), eq(schema.uploads.status, 'pending')))
      .returning();
    if (!updated) {
      // A concurrent complete() won; return its result.
      const [current] = await db
        .select()
        .from(schema.uploads)
        .where(eq(schema.uploads.id, upload.id));
      if (!current) throw new NotFoundException('Upload not found');
      return toView(current);
    }
    if (flag)
      this.logger.warn(
        `Upload ${upload.id} flagged: pHash distance ${flag.distance} to ${flag.id}`,
      );
    return toView(updated);
  }

  /** Signed, short-lived read URL. Participants of the match and moderators only. */
  async signedUrl(userId: string, role: UserRole, uploadId: string, variant: 'full' | 'thumb') {
    this.requireStorage();
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(eq(schema.uploads.id, uploadId))
      .limit(1);
    if (!upload || upload.status !== 'ready') throw new NotFoundException('Upload not found');

    const privileged = role === 'moderator' || role === 'admin';
    if (!privileged && upload.ownerId !== userId) {
      const [side] = upload.matchId
        ? await db
            .select({ id: schema.matchSides.id })
            .from(schema.matchSides)
            .where(
              and(
                eq(schema.matchSides.matchId, upload.matchId),
                eq(schema.matchSides.userId, userId),
              ),
            )
            .limit(1)
        : [];
      if (!side) throw new ForbiddenException('Not allowed to view this screenshot');
    }
    const key = variant === 'thumb' ? upload.thumbKey : upload.storageKey;
    if (!key) throw new NotFoundException('Upload not found');
    return this.storage.presignGet(key, READ_URL_TTL_SEC);
  }

  private async reject(
    id: string,
    quarantineKey: string,
    reason: string,
    extra: { reusedUploadId?: string; sha256?: string; phash?: string } = {},
  ) {
    await db
      .update(schema.uploads)
      .set({ status: 'rejected', rejectReason: reason, completedAt: new Date(), ...extra })
      .where(eq(schema.uploads.id, id));
    await this.storage.deleteObject(quarantineKey).catch(() => undefined);
  }
}

function rejectMessage(reason: string | null): string {
  if (reason === 'reused_screenshot') return UPLOAD_MESSAGES.reused;
  if (reason === 'too_large') return UPLOAD_MESSAGES.tooLarge;
  return UPLOAD_MESSAGES.notAnImage;
}

function toView(u: typeof schema.uploads.$inferSelect): UploadView {
  return {
    id: u.id,
    status: u.status as UploadView['status'],
    width: u.width,
    height: u.height,
    sizeBytes: u.sizeBytes,
    flagged: u.similarUploadId !== null,
  };
}
