import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTarget, validateFreeSubscriptions} from '../scripts/cloudflare-preflight.mjs';
const target = {name: 'idea-grove', account_id: 'a'.repeat(32), database_id: '12345678-abcd-4567-8abc-123456789012', database_name: 'idea-grove-production', vars: {PUBLIC_ORIGIN: 'https://idea-grove.owner.workers.dev', GITHUB_CLIENT_ID: 'actual-client-id', OWNER_GITHUB_ID: '153403020', APP_READ_ONLY: 'false', APP_VERSION: '0.5'}};
test('public deployment rejects placeholders, paid-domain options and public credentials', () => {
  assert.equal(validateTarget(target), target);
  assert.throws(() => validateTarget({...target, account_id: 'REPLACE_ACCOUNT'}));
  assert.throws(() => validateTarget({...target, database_id: '00000000-0000-4000-8000-000000000000'}));
  assert.throws(() => validateTarget({...target, vars: {...target.vars, PUBLIC_ORIGIN: 'https://custom.example'}}));
  assert.throws(() => validateTarget({...target, vars: {...target.vars, SESSION_SECRET: 'must-not-be-public'}}));
  assert.throws(() => validateTarget({...target, r2_buckets: [{bucket_name: 'paid'}]}));
});
test('billing guard accepts only default-free or explicit zero-price free subscriptions', () => {
  validateFreeSubscriptions([]);
  const subscription = {price: 0, state: 'Provisioned', rate_plan: {id: 'free', public_name: 'Workers Free', is_contract: false, externally_managed: false}};
  validateFreeSubscriptions([subscription]);
  for (const s of [{...subscription, price: 5}, {...subscription, rate_plan: {...subscription.rate_plan, public_name: 'Workers Paid'}}, {...subscription, state: 'Trial'}, {...subscription, rate_plan: {id: 'unknown'}}, {...subscription, price: undefined}]) assert.throws(() => validateFreeSubscriptions([s]));
  assert.throws(() => validateFreeSubscriptions(null));
});
