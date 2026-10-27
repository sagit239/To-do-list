import type { Task } from '../../shared/types';

/** Row text: the title, or the start of the description when there is no title. Truncation is visual (CSS). */
export function taskLabel(task: Pick<Task, 'title' | 'description'>): string {
  const title = task.title?.trim();
  if (title) return title;
  return (task.description ?? '').replace(/\s+/g, ' ').trim();
}
