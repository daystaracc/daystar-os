import type { T } from '@/lib/i18n';
import type { TaskPriority, TaskStatus } from '@/lib/tasks/constants';

/**
 * Every string the Tasks client components render, resolved once on the server.
 * Client components stay free of the dictionary and of locale plumbing.
 */
export interface TaskUiLabels {
  view: Record<'my' | 'today' | 'week' | 'all' | 'overdue', string>;
  layout: Record<'list' | 'kanban' | 'calendar', string>;
  status: Record<TaskStatus, string>;
  priority: Record<TaskPriority, string>;
  repeat: Record<'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'monthlyLast', string>;
  empty: Record<'my' | 'today' | 'week' | 'all' | 'overdue' | 'filtered', string>;
  field: Record<'title' | 'assignee' | 'dueDate' | 'priority' | 'project' | 'description' | 'labels' | 'labelsHint' | 'status' | 'recurring' | 'owner' | 'createdBy', string>;
  newTask: string; advanced: string; filters: string; clearAll: string;
  unassigned: string; noProject: string; noDueDate: string;
  checklist: string; checklistAdd: string;
  dependencies: string; dependenciesAdd: string; dependencyNone: string;
  comments: string; commentAdd: string; commentSend: string; commentsEmpty: string;
  activity: string; activityEmpty: string;
  save: string; cancel: string; create: string; close: string; deleteTask: string; deleteConfirm: string;
  readOnly: string; saveFailed: string; retry: string; loadFailed: string; loading: string;
  openTask: string; moveTo: string; addTask: string; recurringHint: string;
  calendarPrev: string; calendarNext: string; calendarToday: string;
  locale: string;
}

export function taskLabels(t: T, locale: string): TaskUiLabels {
  return {
    view: { my: t('tasks.my'), today: t('tasks.today'), week: t('tasks.thisWeek'), all: t('tasks.all'), overdue: t('tasks.overdue') },
    layout: { list: t('tasks.list'), kanban: t('tasks.kanban'), calendar: t('tasks.calendar') },
    status: {
      backlog: t('common.status.backlog'), todo: t('common.status.todo'), in_progress: t('common.status.in_progress'),
      blocked: t('common.status.blocked'), review: t('common.status.review'), done: t('common.status.done'),
    },
    priority: { urgent: t('common.priority.urgent'), high: t('common.priority.high'), medium: t('common.priority.medium'), low: t('common.priority.low') },
    repeat: {
      none: t('tasks.repeat.none'), daily: t('tasks.repeat.daily'), weekdays: t('tasks.repeat.weekdays'),
      weekly: t('tasks.repeat.weekly'), monthly: t('tasks.repeat.monthly'), monthlyLast: t('tasks.repeat.monthlyLast'),
    },
    empty: {
      my: t('tasks.emptyMy'), today: t('tasks.emptyToday'), week: t('tasks.emptyWeek'),
      all: t('tasks.emptyAll'), overdue: t('tasks.emptyOverdue'), filtered: t('tasks.emptyFiltered'),
    },
    field: {
      title: t('tasks.title'), assignee: t('tasks.assignee'), dueDate: t('tasks.dueDate'), priority: t('tasks.priority'),
      project: t('tasks.project'), description: t('tasks.description'), labels: t('tasks.labels'), labelsHint: t('tasks.labelsHint'),
      status: t('tasks.status'), recurring: t('tasks.recurring'), owner: t('tasks.owner'), createdBy: t('tasks.createdBy'),
    },
    newTask: t('tasks.new'), advanced: t('tasks.advanced'), filters: t('tasks.filters'), clearAll: t('tasks.clearAll'),
    unassigned: t('tasks.unassigned'), noProject: t('tasks.noProject'), noDueDate: t('tasks.noDueDate'),
    checklist: t('tasks.checklist'), checklistAdd: t('tasks.checklistAdd'),
    dependencies: t('tasks.dependencies'), dependenciesAdd: t('tasks.dependenciesAdd'), dependencyNone: t('tasks.dependencyNone'),
    comments: t('tasks.comments'), commentAdd: t('tasks.commentAdd'), commentSend: t('tasks.commentSend'), commentsEmpty: t('tasks.commentsEmpty'),
    activity: t('tasks.activity'), activityEmpty: t('tasks.activityEmpty'),
    save: t('common.save'), cancel: t('common.cancel'), create: t('common.create'), close: t('common.close'),
    deleteTask: t('tasks.delete'), deleteConfirm: t('tasks.deleteConfirm'),
    readOnly: t('tasks.readOnly'), saveFailed: t('tasks.saveFailed'), retry: t('tasks.retry'),
    loadFailed: t('tasks.loadFailed'), loading: t('tasks.loading'),
    openTask: t('tasks.openTask'), moveTo: t('tasks.moveTo'), addTask: t('tasks.addTask'), recurringHint: t('tasks.recurringHint'),
    calendarPrev: t('tasks.calendarPrev'), calendarNext: t('tasks.calendarNext'), calendarToday: t('tasks.calendarToday'),
    locale,
  };
}

/** Maps a stored `recurring_rule` to its label. */
export function repeatLabel(rule: string | null, r: TaskUiLabels['repeat']): string {
  if (!rule) return r.none;
  if (rule === 'daily') return r.daily;
  if (rule === 'weekdays') return r.weekdays;
  if (rule.startsWith('weekly:')) return r.weekly;
  if (rule === 'monthly:last') return r.monthlyLast;
  if (rule.startsWith('monthly:')) return r.monthly;
  return r.none;
}
