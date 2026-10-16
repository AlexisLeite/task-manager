import {document as emptyDocument, minutes, time, clock, nextCode} from './model.js';

export function shiftDate(key, count = 1) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + count);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export const endMinute = row => minutes(row.end) + (row.endDay || 0) * 1440;

// Continuations exist only in the UI. The source task and its full interval
// are persisted once, on the start date.
export function canonicalWorkspace(data) {
  const copy = structuredClone(data);
  for (const day of Object.values(copy.days)) {
    const plan = day.plan;
    const projected = new Set(plan.projectedTaskIds || []);
    plan.blocks = plan.blocks.filter(row => !row.continuation);
    plan.tasks = plan.tasks.filter(task => !projected.has(task.id));
    delete plan.projectedTaskIds;
  }
  return copy;
}
export function refreshContinuations(data) {
  for (const day of Object.values(data.days)) {
    const plan = day.plan;
    const projected = new Set(plan.projectedTaskIds || []);
    plan.blocks = plan.blocks.filter(row => !row.continuation);
    plan.tasks = plan.tasks.filter(task => !projected.has(task.id));
    delete plan.projectedTaskIds;
  }
  for (const [key, day] of Object.entries(data.days)) {
    for (const row of [...day.plan.blocks]) {
      if (row.continuation || !row.endDay || !clock(row.end) || minutes(row.end) === 0) continue;
      const next = (data.days[shiftDate(key)] ||= {plan:emptyDocument(),actual:null}).plan;
      for (const id of row.taskIds) {
        const task = day.plan.tasks.find(task=>task.id === id);
        if (task && !next.tasks.some(task=>task.id === id)) {
          const codes = (next.continuationCodes ||= {});
          let code = codes[id] || task.code;
          if (next.tasks.some(other=>other.code === code)) code = nextCode(next.tasks);
          codes[id] = code;
          const projected = {};
          for (const field of Object.keys(task)) Object.defineProperty(projected,field,{
            enumerable:true, configurable:true,
            get:()=>field === 'code' ? codes[id] : task[field],
            set:value=>{ if (field === 'code') codes[id] = value; else task[field] = value; },
          });
          next.tasks.push(projected);
          (next.projectedTaskIds ||= []).push(id);
        }
      }
      row.focusStates ||= {};
      next.blocks.push({...row, start:'00:00', endDay:0, continuation:{date:key,id:row.id}});
    }
  }
}
export function sourceSchedule(data, key, row) {
  if (!row?.continuation) return {key,row};
  const source = row.continuation;
  return {key:source.date,row:data.days[source.date]?.plan.blocks.find(row=>row.id === source.id)};
}

// Remove only the visible day's interval, keeping the surviving endpoint
// and task identity. Actual work is deliberately untouched.
export function removeDayPortions(workspace, key, ids) {
  const data = canonicalWorkspace(workspace);
  for (const id of ids) {
    for (const [sourceDate, day] of Object.entries(data.days)) {
      const plan = day.plan;
      const task = plan.tasks.find(task=>task.id === id);
      if (!task) continue;
      for (const row of [...plan.blocks]) {
        if (!row.taskIds.includes(id)) continue;
        const firstDay = sourceDate === key;
        const lastDay = row.endDay && shiftDate(sourceDate) === key;
        if (!firstDay && !lastDay) continue;
        const surviving = {...structuredClone(row), taskIds:[id]};
        if (row.taskIds.length > 1) surviving.id = crypto.randomUUID();
        row.taskIds = row.taskIds.filter(taskId=>taskId !== id);
        if (lastDay) {
          surviving.end = '00:00';
          surviving.endDay = 1;
          task.estimate = time(1440-minutes(row.start));
          plan.blocks.push(surviving);
        } else if (row.endDay && minutes(row.end) > 0) {
          const next = (data.days[shiftDate(sourceDate)] ||= {plan:emptyDocument(),actual:null}).plan;
          const moved = structuredClone(task);
          moved.code = next.continuationCodes?.[id] || task.code;
          if (next.tasks.some(other=>other.id !== id && other.code === moved.code)) moved.code = nextCode(next.tasks);
          moved.estimate = time(minutes(row.end));
          if (!next.tasks.some(other=>other.id === id)) next.tasks.push(moved);
          surviving.start = '00:00';
          surviving.endDay = 0;
          next.blocks.push(surviving);
          if (next.continuationCodes) delete next.continuationCodes[id];
        }
      }
      plan.blocks = plan.blocks.filter(row=>row.taskIds.length || row.refsText);
      if (!plan.blocks.some(row=>row.taskIds.includes(id))) plan.tasks = plan.tasks.filter(task=>task.id !== id);
    }
  }
  return data;
}
