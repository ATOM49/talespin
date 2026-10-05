import type { NextConfig } from 'next';

type RemotePattern = NonNullable<
  NonNullable<NextConfig['images']>['remotePatterns']
>[number];

// Allow next/image to optimize generated art from the configured CDN. Mirrors
// resolvePublicBaseUrl in packages/cdn: MINIO_PUBLIC_BASE_URL (bucket root,
// e.g. an R2 public domain) wins over path-style MINIO_PUBLIC_HOST/MINIO_BUCKET.
// Next reads this at build and start (Vercel bakes it in at build), so set the
// same values in every environment.
const cdnImagePattern = (): RemotePattern => {
  const bucket = process.env.MINIO_BUCKET || 'images';
  const publicHost = (
    process.env.MINIO_PUBLIC_HOST || 'http://localhost:9000'
  ).replace(/\/+$/, '');
  const baseUrl = new URL(
    process.env.MINIO_PUBLIC_BASE_URL || `${publicHost}/${bucket}`,
  );
  const basePath = baseUrl.pathname.replace(/\/+$/, '');

  return {
    protocol: baseUrl.protocol === 'https:' ? 'https' : 'http',
    hostname: baseUrl.hostname,
    port: baseUrl.port,
    pathname: `${basePath}/**`,
  };
};

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [cdnImagePattern()],
  },
};

export default nextConfig;
