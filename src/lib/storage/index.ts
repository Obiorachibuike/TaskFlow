/**
 * Object storage abstraction for attachments.
 * - Local driver (default): stores files under LOCAL_STORAGE_DIR, serves via a
 *   protected API route that re-checks workspace membership.
 * - S3 driver: any S3-compatible bucket (AWS, R2, MinIO …) when STORAGE_DRIVER=s3.
 */
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { createReadStream, type ReadStream } from "node:fs";
import { logger } from "@/lib/logger";

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<{ data?: Buffer; stream?: ReadStream; size: number; contentType?: string }>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    const safe = normalize(key).replace(/^([/\\.])+/, "");
    const full = join(this.root, safe);
    if (!full.startsWith(this.root + sep) && full !== this.root) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<StoredObject> {
    const full = this.pathFor(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return { key, sizeBytes: data.length };
  }

  async get(key: string) {
    const full = this.pathFor(key);
    const info = await stat(full);
    return { stream: createReadStream(full), size: info.size };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch {
      /* already gone */
    }
  }
}

class S3Storage implements StorageProvider {
  readonly name = "s3";
  private client: import("@aws-sdk/client-s3").S3Client | null = null;
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  private async getClient() {
    if (!this.client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.client = new S3Client({
        region: process.env.S3_REGION ?? "us-east-1",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials:
          process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
    }
    return this.client;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
    return { key, sizeBytes: data.length };
  }

  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const data = await res.Body?.transformToByteArray();
    return { data: Buffer.from(data ?? []), size: data?.length ?? 0, contentType: res.ContentType };
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      logger.warn("storage.s3.missing_bucket");
      provider = new LocalStorage(process.env.LOCAL_STORAGE_DIR ?? ".data/uploads");
    } else {
      provider = new S3Storage(bucket);
    }
  } else {
    provider = new LocalStorage(process.env.LOCAL_STORAGE_DIR ?? ".data/uploads");
  }
  return provider;
}

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);
}
