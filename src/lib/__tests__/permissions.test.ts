import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, homeFor, canEditTask, canDeleteTask, canEditContent, type Role } from '../permissions';

const ROLES: Role[] = ['founder', 'manager', 'member'];

/**
 * `permissions.ts` is the UI-side mirror of this app's RLS policies (the database
 * stays the real authority — see the file's own comment) — every `can.*` gate here
 * is hand-documented against a specific policy or spec section. These tests lock in
 * that matrix so a future edit that loosens or tightens a gate by accident (e.g.
 * `viewCRM` drifting from founder-only to founder/manager) fails a test instead of
 * silently shipping — the same class of file `showmoreClient.ts`'s
 * `verifyWebhookSignature` is, deserving the same "pure, security/authz-relevant,
 * zero coverage" treatment.
 */

function assertRoles(fn: (r: Role) => boolean, allowed: Role[], label: string) {
  for (const role of ROLES) {
    assert.equal(fn(role), allowed.includes(role), `${label}(${role}) should be ${allowed.includes(role)}`);
  }
}

test('can.viewFinance: founder only', () => assertRoles(can.viewFinance, ['founder'], 'viewFinance'));
test('can.viewRevenue: founder and manager', () => assertRoles(can.viewRevenue, ['founder', 'manager'], 'viewRevenue'));
test('can.editTargets: founder only', () => assertRoles(can.editTargets, ['founder'], 'editTargets'));
test('can.manageUsers: founder only', () => assertRoles(can.manageUsers, ['founder'], 'manageUsers'));
test('can.manageProjects: founder and manager', () => assertRoles(can.manageProjects, ['founder', 'manager'], 'manageProjects'));
test('can.editProducts: founder and manager', () => assertRoles(can.editProducts, ['founder', 'manager'], 'editProducts'));
test('can.recordInventoryMovement: every role, including member', () => assertRoles(can.recordInventoryMovement, ROLES, 'recordInventoryMovement'));
test('can.createTask: every role, including member', () => assertRoles(can.createTask, ROLES, 'createTask'));
test('can.scoreSystems: founder and manager', () => assertRoles(can.scoreSystems, ['founder', 'manager'], 'scoreSystems'));
test('can.viewReviews: founder and manager (matches spec/nav, not the more permissive reviews_select RLS)', () =>
  assertRoles(can.viewReviews, ['founder', 'manager'], 'viewReviews'));
test('can.viewMarketing: founder and manager (matches spec/nav, not the more permissive campaigns_select RLS)', () =>
  assertRoles(can.viewMarketing, ['founder', 'manager'], 'viewMarketing'));
test('can.viewCRM: founder only — the strictest gate, matching customers_all RLS', () =>
  assertRoles(can.viewCRM, ['founder'], 'viewCRM'));
test('can.managePillars: founder and manager (matches pillars_insert/pillars_update RLS, migration 0012)', () =>
  assertRoles(can.managePillars, ['founder', 'manager'], 'managePillars'));
test('can.viewSettings: founder only', () => assertRoles(can.viewSettings, ['founder'], 'viewSettings'));
test('can.viewAuditLog: founder and manager, matching activity_logs_select RLS exactly', () =>
  assertRoles(can.viewAuditLog, ['founder', 'manager'], 'viewAuditLog'));

test('homeFor: members land on My Work, everyone else on Overview', () => {
  assert.equal(homeFor('member'), '/my-work');
  assert.equal(homeFor('manager'), '/overview');
  assert.equal(homeFor('founder'), '/overview');
});

test('canEditTask: managers and founders can edit any task regardless of ownership', () => {
  const task = { owner_id: 'someone-else', assignee_id: 'someone-else', created_by: 'someone-else' };
  assert.equal(canEditTask(task, 'founder', 'me'), true);
  assert.equal(canEditTask(task, 'manager', 'me'), true);
});

test('canEditTask: a member can edit only a task they own, are assigned, or created', () => {
  assert.equal(canEditTask({ owner_id: 'me', assignee_id: null, created_by: null }, 'member', 'me'), true);
  assert.equal(canEditTask({ owner_id: null, assignee_id: 'me', created_by: null }, 'member', 'me'), true);
  assert.equal(canEditTask({ owner_id: null, assignee_id: null, created_by: 'me' }, 'member', 'me'), true);
  assert.equal(canEditTask({ owner_id: 'someone-else', assignee_id: null, created_by: null }, 'member', 'me'), false);
  assert.equal(canEditTask({ owner_id: null, assignee_id: null, created_by: null }, 'member', 'me'), false);
});

test('canDeleteTask: managers and founders can delete any task; a member only one they created', () => {
  const task = { created_by: 'someone-else' };
  assert.equal(canDeleteTask(task, 'founder', 'me'), true);
  assert.equal(canDeleteTask(task, 'manager', 'me'), true);
  assert.equal(canDeleteTask(task, 'member', 'me'), false);
  assert.equal(canDeleteTask({ created_by: 'me' }, 'member', 'me'), true);
  // Ownership/assignment (unlike canEditTask) doesn't grant delete — only creation does.
  assert.equal(canDeleteTask({ created_by: 'someone-else' }, 'member', 'me'), false);
});

test('canEditContent: managers and founders can edit any content piece regardless of ownership', () => {
  const content = { owner_id: 'someone-else', created_by: 'someone-else' };
  assert.equal(canEditContent(content, 'founder', 'me'), true);
  assert.equal(canEditContent(content, 'manager', 'me'), true);
});

test('canEditContent: a member can edit only content they own or created', () => {
  assert.equal(canEditContent({ owner_id: 'me', created_by: null }, 'member', 'me'), true);
  assert.equal(canEditContent({ owner_id: null, created_by: 'me' }, 'member', 'me'), true);
  assert.equal(canEditContent({ owner_id: 'someone-else', created_by: null }, 'member', 'me'), false);
  assert.equal(canEditContent({ owner_id: null, created_by: null }, 'member', 'me'), false);
});
