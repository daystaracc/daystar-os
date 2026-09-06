/** Role helpers mirrored from the RLS policies (UI convenience only — the database is the authority). */
export type Role = 'founder' | 'manager' | 'member';

export const can = {
  viewFinance: (r: Role) => r === 'founder',
  viewRevenue: (r: Role) => r === 'founder' || r === 'manager',
  editTargets: (r: Role) => r === 'founder',
  manageUsers: (r: Role) => r === 'founder',
  manageProjects: (r: Role) => r === 'founder' || r === 'manager',
  editProducts: (r: Role) => r === 'founder' || r === 'manager',
  recordInventoryMovement: (_r: Role) => true,
  createTask: (_r: Role) => true,
  scoreSystems: (r: Role) => r === 'founder' || r === 'manager',
};

/** Navigation visible per role. Members land on My Work. */
export function homeFor(role: Role): string { return role === 'member' ? '/my-work' : '/overview'; }

/**
 * Mirrors the `tasks_update` RLS policy so the UI can disable controls the database
 * would reject anyway: managers and founders edit anything; everyone else edits the
 * tasks they own, are assigned, or created.
 */
export function canEditTask(task: { owner_id: string | null; assignee_id: string | null; created_by: string | null }, role: Role, userId: string): boolean {
  if (role === 'founder' || role === 'manager') return true;
  return task.owner_id === userId || task.assignee_id === userId || task.created_by === userId;
}

/** `tasks_delete`: managers and above, or whoever created it. */
export function canDeleteTask(task: { created_by: string | null }, role: Role, userId: string): boolean {
  return role === 'founder' || role === 'manager' || task.created_by === userId;
}
