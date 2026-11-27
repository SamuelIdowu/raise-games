/**
 * FileStoragePort (TA "Uploads"): the domain never talks to R2/S3 directly.
 * Objects are private; reads go out only as short-lived signed URLs.
 */
export interface PresignedPut {
  url: string;
  /** Headers the client must send unchanged, or the signature fails. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface FileStoragePort {
  readonly configured: boolean;
  presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSec: number,
  ): Promise<PresignedPut>;
  presignGet(key: string, expiresInSec: number): Promise<{ url: string; expiresAt: Date }>;
  /** Returns null when the object does not exist. */
  getObject(key: string, maxBytes: number): Promise<Buffer | null>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  ensureBucket(): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export class ObjectTooLargeError extends Error {
  constructor() {
    super('Stored object is larger than allowed');
  }
}
