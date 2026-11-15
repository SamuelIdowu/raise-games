import { Global, Logger, Module, type OnModuleInit, Inject } from '@nestjs/common';
import { env } from '../config/env.instance';
import { FILE_STORAGE, type FileStoragePort } from './file-storage.port';
import { S3FileStorageAdapter } from './s3-file-storage.adapter';

@Global()
@Module({
  providers: [{ provide: FILE_STORAGE, useFactory: () => new S3FileStorageAdapter(env) }],
  exports: [FILE_STORAGE],
})
export class StorageModule implements OnModuleInit {
  private readonly logger = new Logger(StorageModule.name);

  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStoragePort) {}

  async onModuleInit() {
    if (!this.storage.configured) {
      this.logger.warn('File storage is not configured; screenshot uploads will return 503.');
      return;
    }
    if (env.STORAGE_AUTO_CREATE_BUCKET && env.NODE_ENV !== 'production') {
      try {
        await this.storage.ensureBucket();
      } catch (err) {
        this.logger.warn(`Could not ensure storage bucket: ${String(err)}`);
      }
    }
  }
}
