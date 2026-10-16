import { uid } from './model.js';

// Update only records linked to this execution, never other days by task name.
export function syncRecordedProject(data, row, task) {
  if (!row) return;
  const sources = new Set([`${row.id}/${task.id}`, row.resumeSourceFocus].filter(Boolean));
  for (const day of Object.values(data.days)) {
    const actual = day.actual;
    if (!actual) continue;
    const matching = actual.blocks.filter(block => sources.has(block.sourceFocus));
    for (const id of new Set(matching.flatMap(block => block.taskIds))) {
      const recorded = actual.tasks.find(item => item.id === id);
      if (!recorded || (recorded.projectId || '') === (task.projectId || '')) continue;
      const shared = actual.blocks.some(block => !matching.includes(block) && block.taskIds.includes(id));
      const target = shared ? {...recorded, id:uid()} : recorded;
      if (shared) {
        actual.tasks.push(target);
        for (const block of matching) block.taskIds = block.taskIds.map(value => value === id ? target.id : value);
      }
      target.projectId = task.projectId || '';
    }
  }
}
