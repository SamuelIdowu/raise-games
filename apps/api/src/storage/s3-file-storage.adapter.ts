import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env';
import { ObjectTooLargeError, type FileStoragePort, type PresignedPut } from './file-storage.port';

/** S3 API adapter: Cloudflare R2 in production, SeaweedFS (docker compose) locally. */
export class S3FileStorageAdapter implements FileStoragePort {
  readonly configured: boolean;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly env: Env) {
    const endpoint =
      env.STORAGE_ENDPOINT ??
      (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
    this.configured = Boolean(endpoint && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
    this.bucket = env.R2_BUCKET;
    this.client = new S3Client({
      endpoint,
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? 'unset',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? 'unset',
      },
      // Presigned PUTs must not carry SDK checksum headers the browser cannot reproduce.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSec: number,
  ): Promise<PresignedPut> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    // content-type and content-length are part of the signature: a different type
    // or a larger body is rejected by the store itself.
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSec,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      url,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
    };
  }

  async presignGet(key: string, expiresInSec: number) {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
    return { url, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
  }

  async getObject(key: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (res.ContentLength !== undefined && res.ContentLength > maxBytes) {
        throw new ObjectTooLargeError();
      }
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) return null;
      if (bytes.byteLength > maxBytes) throw new ObjectTooLargeError();
      return Buffer.from(bytes);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as Partial<S3ServiceException> & { Code?: string };
  return (
    e?.name === 'NoSuchKey' ||
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchBucket' ||
    e?.$metadata?.httpStatusCode === 404
  );
}
