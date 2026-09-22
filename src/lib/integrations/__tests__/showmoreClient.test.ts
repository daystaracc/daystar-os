import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

// verifyWebhookSignature reads SHOWMORE_API_KEY lazily (inside apiKey(), called on
// every invocation, not at import time) — set before the test file's tests run.
const KEY = 'test-key-do-not-use-in-prod';
process.env.SHOWMORE_API_KEY = KEY;

import { verifyWebhookSignature } from '../showmoreClient';
const sign = (body: string, key: string = KEY): string =>
  `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;

/**
 * This is the entire auth boundary for the webhook route (src/app/api/webhooks/
 * showmore/route.ts) — an external caller is trusted purely on this check passing,
 * with no signed-in user behind it. Every case here is a case where getting the
 * boolean wrong either locks out real Showmore events or lets a forged POST write
 * fake orders into sales_daily.
 */

test('verifyWebhookSignature: accepts a correctly-signed body', () => {
  const body = JSON.stringify({ order_number: 'SM-1001', event: 'created' });
  assert.equal(verifyWebhookSignature(body, sign(body)), true);
});

test('verifyWebhookSignature: rejects when the body was tampered with after signing', () => {
  const original = JSON.stringify({ order_number: 'SM-1001', event: 'created' });
  const signature = sign(original);
  const tampered = JSON.stringify({ order_number: 'SM-9999', event: 'created' });
  assert.equal(verifyWebhookSignature(tampered, signature), false);
});

test('verifyWebhookSignature: rejects a signature made with the wrong key', () => {
  const body = JSON.stringify({ order_number: 'SM-1001' });
  assert.equal(verifyWebhookSignature(body, sign(body, 'wrong-key')), false);
});

test('verifyWebhookSignature: rejects a missing header', () => {
  assert.equal(verifyWebhookSignature('{}', null), false);
});

test('verifyWebhookSignature: rejects a header without the sha256= prefix', () => {
  const body = '{}';
  const raw = createHmac('sha256', KEY).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, raw), false); // missing "sha256=" entirely
  assert.equal(verifyWebhookSignature(body, `sha1=${raw}`), false); // wrong prefix
});

test('verifyWebhookSignature: rejects empty and garbage signature values without throwing', () => {
  assert.equal(verifyWebhookSignature('{}', 'sha256='), false); // empty hex — length mismatch, not a crash
  assert.equal(verifyWebhookSignature('{}', 'sha256=not-hex-at-all'), false);
  assert.equal(verifyWebhookSignature('{}', 'sha256=deadbeef'), false); // valid hex, wrong length
});

test('verifyWebhookSignature: accepts uppercase hex the same as lowercase (Buffer hex parsing is case-insensitive)', () => {
  const body = JSON.stringify({ order_number: 'SM-1001' });
  const hex = sign(body).slice('sha256='.length);
  assert.equal(verifyWebhookSignature(body, `sha256=${hex.toUpperCase()}`), true);
});

test('verifyWebhookSignature: an empty body still verifies correctly (not just non-empty payloads)', () => {
  assert.equal(verifyWebhookSignature('', sign('')), true);
  assert.equal(verifyWebhookSignature('', sign('{}')), false);
});
