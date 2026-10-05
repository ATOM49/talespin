import { Client as MinioClient } from 'minio';
import type { BucketItem } from 'minio';
import { randomUUID } from 'crypto';

export type MinioClientOptions = {
  bucket?: string;
  publicHost?: string;
  /**
   * Full public URL of the bucket root, for CDNs that do not put the bucket
   * name in the path (Cloudflare R2 public buckets, S3 virtual-hosted URLs).
   * Takes precedence over `publicHost`.
   */
  publicBaseUrl?: string;
};

/**
 * Resolves the URL prefix under which uploaded keys are publicly readable:
 * `publicBaseUrl` as given, otherwise path-style `${publicHost}/${bucket}`.
 */
export const resolvePublicBaseUrl = ({
  bucket,
  publicHost,
  publicBaseUrl,
}: {
  bucket: string;
  publicHost: string;
  publicBaseUrl?: string;
}): string =>
  publicBaseUrl
    ? publicBaseUrl.replace(/\/+$/, '')
    : `${publicHost.replace(/\/+$/, '')}/${bucket}`;

export type UploadBufferArgs = {
  buffer: Buffer;
  keyPrefix?: string;
  contentType?: string;
};

export type FindObjectByPrefixArgs = {
  keyPrefix: string;
  /**
   * Whether to return the newest (latest) or oldest object within the prefix.
   * Defaults to newest to maximize cache freshness.
   */
  select?: 'latest' | 'oldest';
};

export type MinioClientInstance = {
  uploadBuffer: (
    args: UploadBufferArgs,
  ) => Promise<{ key: string; url: string }>;
  findObjectByPrefix: (
    args: FindObjectByPrefixArgs,
  ) => Promise<{ key: string; url: string } | null>;
  getPublicURL: (key: string) => string;
  bucket: string;
};

export const extensionForContentType = (contentType: string): string => {
  switch (contentType.split(';', 1)[0]?.trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    case 'image/png':
    default:
      return 'png';
  }
};

/**
 * Creates a MinIO client instance for CDN operations
 *
 * @param options - Configuration options
 * @returns MinIO client instance with upload and URL generation methods
 *
 * @example
 * ```typescript
 * const client = createMinioClient({
 *   bucket: 'images',
 *   publicHost: 'http://localhost:9000'
 * });
 *
 * const { url } = await client.uploadBuffer({
 *   buffer: imageBuffer,
 *   keyPrefix: 'maps/'
 * });
 * ```
 */
export function createMinioClient(
  options: MinioClientOptions = {},
): MinioClientInstance {
  const client = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: (process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    // Setting a region skips the bucket-location lookup (use "auto" for R2).
    region: process.env.MINIO_REGION || undefined,
  });

  const bucket = options.bucket || process.env.MINIO_BUCKET || 'images';
  const publicHost =
    options.publicHost ||
    process.env.MINIO_PUBLIC_HOST ||
    'http://localhost:9000';

  const publicBaseUrl = resolvePublicBaseUrl({
    bucket,
    publicHost,
    publicBaseUrl:
      options.publicBaseUrl || process.env.MINIO_PUBLIC_BASE_URL || undefined,
  });

  const getPublicURL = (key: string): string => {
    return `${publicBaseUrl}/${encodeURI(key)}`;
  };

  const uploadBuffer = async ({
    buffer,
    keyPrefix = 'maps/',
    contentType = 'image/png',
  }: UploadBufferArgs): Promise<{ key: string; url: string }> => {
    const extension = extensionForContentType(contentType);
    const key = `${keyPrefix}${randomUUID()}.${extension}`;

    await client.putObject(bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    return { key, url: getPublicURL(key) };
  };

  const findObjectByPrefix = async ({
    keyPrefix,
    select = 'latest',
  }: FindObjectByPrefixArgs): Promise<{ key: string; url: string } | null> => {
    return new Promise((resolve, reject) => {
      const stream = client.listObjectsV2(bucket, keyPrefix, true);
      let candidate: BucketItem | null = null;

      stream.on('data', (item: BucketItem) => {
        if (!item?.name) {
          return;
        }

        if (!candidate) {
          candidate = item;
          return;
        }

        const candidateTime = candidate.lastModified?.getTime() ?? 0;
        const currentTime = item.lastModified?.getTime() ?? 0;

        if (select === 'latest' && currentTime > candidateTime) {
          candidate = item;
          return;
        }

        if (select === 'oldest' && currentTime < candidateTime) {
          candidate = item;
        }
      });

      stream.on('error', (error) => reject(error));
      stream.on('end', () => {
        if (candidate?.name) {
          resolve({ key: candidate.name, url: getPublicURL(candidate.name) });
        } else {
          resolve(null);
        }
      });
    });
  };

  return {
    uploadBuffer,
    findObjectByPrefix,
    getPublicURL,
    bucket,
  };
}
