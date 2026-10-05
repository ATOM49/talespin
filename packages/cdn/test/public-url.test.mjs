import assert from 'node:assert/strict';
import test from 'node:test';
import { createMinioClient, resolvePublicBaseUrl } from '../dist/index.js';

test('resolvePublicBaseUrl defaults to path-style bucket URLs', () => {
  assert.equal(
    resolvePublicBaseUrl({
      bucket: 'images',
      publicHost: 'http://localhost:9000/',
    }),
    'http://localhost:9000/images',
  );
});

test('resolvePublicBaseUrl prefers an explicit bucket-root URL', () => {
  assert.equal(
    resolvePublicBaseUrl({
      bucket: 'images',
      publicHost: 'http://localhost:9000',
      publicBaseUrl: 'https://pub-123.r2.dev/',
    }),
    'https://pub-123.r2.dev',
  );
});

test('client public URLs use the configured base URL', () => {
  const client = createMinioClient({
    bucket: 'images',
    publicBaseUrl: 'https://assets.example.com',
  });
  assert.equal(
    client.getPublicURL('maps/a b.png'),
    'https://assets.example.com/maps/a%20b.png',
  );
});
