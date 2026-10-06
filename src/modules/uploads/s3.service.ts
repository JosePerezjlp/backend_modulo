import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private config: ConfigService) {
    this.region = this.config.get<string>('AWS_REGION', 'us-east-1');
    this.bucket = this.config.get<string>('S3_BUCKET_NAME', '');
    this.publicBaseUrl = (
      this.config.get<string>('S3_PUBLIC_BASE_URL') ||
      `https://${this.bucket}.s3.${this.region}.amazonaws.com`
    ).replace(/\/$/, '');

    this.logger.log(
      `S3 configured: bucket=${this.bucket}, region=${this.region}`,
    );

    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async upload(
    file: Express.Multer.File,
    folder: string = 'products',
  ): Promise<string> {
    const key = `${folder}/${randomUUID()}${extname(file.originalname)}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`S3 upload failed: ${msg}`, stack);
      throw new InternalServerErrorException(
        `Error subiendo imagen a S3: ${msg}`,
      );
    }

    const url = `${this.publicBaseUrl}/${key}`;
    this.logger.log(`Uploaded: ${url}`);
    return url;
  }

  async delete(url: string): Promise<void> {
    const key = this.extractKeyFromUrl(url);
    if (!key) return;

    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.log(`Deleted: ${key}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`S3 delete failed: ${msg}`, stack);
    }
  }

  private extractKeyFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.pathname.substring(1);
    } catch {
      return null;
    }
  }
}
