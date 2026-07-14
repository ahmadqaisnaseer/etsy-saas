import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Environment } from '@etsy-saas/shared';

export class ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly env: Environment) {
    this.client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  healthCheck = async (): Promise<void> => {
    await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
  };

  async createUploadUrl(
    tenantId: string,
    objectId: string,
    contentType: string,
  ): Promise<{ key: string; url: string }> {
    const key = `tenants/${tenantId}/${objectId}`;
    const command = new PutObjectCommand({
      Bucket: this.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
      Metadata: { tenantId },
    });
    return { key, url: await getSignedUrl(this.client, command, { expiresIn: 300 }) };
  }
}
