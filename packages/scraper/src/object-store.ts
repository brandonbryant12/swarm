import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectStore } from "@swarm/types";

export interface S3ObjectStoreConfig {
  readonly endpoint?: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly forcePathStyle: boolean;
}

export class S3JsonObjectStore implements ObjectStore {
  private readonly client: S3Client;

  constructor(private readonly config: S3ObjectStoreConfig) {
    this.client = new S3Client({
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return;
    } catch (error) {
      const status = this.getHttpStatus(error);
      if (status !== 404 && status !== 400) {
        throw error;
      }
    }

    await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const body = Buffer.from(JSON.stringify(value));
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
      }),
    );
  }

  private getHttpStatus(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null) {
      return undefined;
    }

    const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
    return metadata?.httpStatusCode;
  }
}
