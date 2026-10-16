import {canonicalWorkspace,shiftDate,endMinute} from './overnight.js';
import {document as newDocument,clock,minutes,time,nextCode,uid} from './model.js';
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export function shiftAgenda(workspace, pausedAt, resumedAt) {
  const data = canonicalWorkspace(workspace);
  const elapsedMs = resumedAt-pausedAt;
  const anchor = Math.min(pausedAt,resumedAt,workspace.timeControl?.pausedAt ?? Infinity);
  const pause = new Date(anchor), key = dateKey(pause);
  const jobs = [];
  for (const sourceDate of Object.keys(data.days).filter(date=>date<=key)) {
    const plan = data.days[sourceDate]?.plan;
    for (const row of plan?.blocks || []) {
      const openEnded = row.openStarted && !row.end;
      if (!clock(row.start) || (!clock(row.end) && !openEnded)) continue;
      const end = new Date(`${sourceDate}T00:00:00`); end.setMinutes(endMinute(row));
      if ((!openEnded && end.getTime() <= anchor) || (sourceDate !== key && !row.endDay && !openEnded)) continue;
      const tasks = plan.tasks.filter(task=>row.taskIds.includes(task.id) && !row.focusStates?.[task.id]);
      if (!tasks.length) continue;
      jobs.push({sourceDate,row:structuredClone(row),tasks:structuredClone(tasks)});
      row.taskIds = row.taskIds.filter(id=>!tasks.some(task=>task.id === id));
    }
  }
  for (const {sourceDate,row,tasks} of jobs) {
    // Grid schedules have minute precision. Carry the remainder so short
    // pauses never become a whole minute just by crossing the clock boundary.
    const offsetMs = elapsedMs + (row.pauseOffsetMs || 0);
    const delta = Math.round(offsetMs/60000);
    row.pauseOffsetMs = offsetMs-delta*60000;
    const start = new Date(`${sourceDate}T00:00:00`); start.setMinutes(minutes(row.start)+delta);
    const finish = new Date(`${sourceDate}T00:00:00`); finish.setMinutes(endMinute(row)+delta);
    const destination = dateKey(start);
    const plan = (data.days[destination] ||= {plan:newDocument(),actual:null}).plan;
    for (const task of tasks) {
      if (plan.tasks.some(other=>other.id === task.id)) continue;
      if (plan.tasks.some(other=>other.code === task.code)) task.code = nextCode(plan.tasks);
      plan.tasks.push(task);
    }
    const shared = data.days[sourceDate].plan.blocks.find(other=>other.id === row.id)?.taskIds.length;
    plan.blocks.push({...row,id:shared?uid():row.id,taskIds:tasks.map(task=>task.id),start:time(start.getHours()*60+start.getMinutes()),end:row.openStarted && !row.end ? '' : time(finish.getHours()*60+finish.getMinutes()),endDay:row.openStarted && !row.end ? 0 : dateKey(finish) === destination ? 0 : 1});
  }
  for (const day of Object.values(data.days)) {
    day.plan.blocks = day.plan.blocks.filter(row=>row.taskIds.length || row.refsText);
    const movedIds = new Set(jobs.flatMap(job=>job.tasks.map(task=>task.id)));
    day.plan.tasks = day.plan.tasks.filter(task=>!movedIds.has(task.id) || day.plan.blocks.some(row=>row.taskIds.includes(task.id)));
  }
  data.timeControl = {pausedAt:null};
  return data;
}
