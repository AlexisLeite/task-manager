import {chooseValue} from "./helpers/combo.js";
import { test, expect } from "@playwright/test";
import { document as empty, task, block } from '../src/model.js';

test('reanudar persiste nuevas instancias y sus tramos anteriores en SQLite', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-16T10:00:00')});
  await page.clock.pauseAt(new Date('2026-10-16T10:00:00'));
  const plan=empty();
  for (const name of ['A','B']) {
    const item={...task(plan.tasks),name,estimate:'02:00',projectId:'p'};
    plan.tasks.push(item);
  }
  // Both tasks share a block, so closing one must not change the other's identity.
  plan.blocks.push({...block(),taskIds:plan.tasks.map(t=>t.id),start:'09:00',end:'11:00'});
  expect((await page.request.post('/api/login',{data:{username:'alexis',password:'alexis123'}})).ok()).toBeTruthy();
  const loaded=await page.request.get('/api/workspace');
  expect((await page.request.put('/api/workspace',{headers:{'If-Match':loaded.headers().etag},
    data:{version:2,tasks:[],projects:[{id:'p',name:'POC'}],days:{'2026-10-16':{plan,actual:null}}}})).ok()).toBeTruthy();
  await page.goto('/#/jornada');
  await page.getByRole('button',{name:'Pausar el tiempo',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.clock.fastForward(1800000);
  await page.reload();
  await page.getByRole('button',{name:'Reanudar el tiempo',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Guardado');
  const data=await (await page.request.get('/api/workspace')).json();
  const day=data.days['2026-10-16'];
  expect(day.plan.tasks).toHaveLength(4);
  expect(day.actual.blocks).toHaveLength(2);
  expect(day.actual.blocks.map(row=>[row.start,row.end])).toEqual([['09:00','10:00'],['09:00','10:00']]);
  expect(new Set(day.plan.blocks.map(row=>row.id)).size).toBe(4);
  for (const original of plan.tasks) {
    const instances=day.plan.tasks.filter(task=>task.name===original.name);
    expect(instances).toHaveLength(2);
    expect(instances.every(task=>task.taskId===original.taskId && task.projectId==='p')).toBe(true);
    const previous=day.plan.blocks.find(row=>row.taskIds.includes(original.id));
    const current=day.plan.blocks.find(row=>row.taskIds.includes(instances.find(t=>t.id!==original.id).id));
    expect(previous).toMatchObject({start:'09:00',end:'10:00',focusStates:{[original.id]:'finished'}});
    expect(current).toMatchObject({start:'10:30',end:'11:30'});
  }
  await page.reload();
  await expect(page.getByRole('button',{name:'Pausar el tiempo',exact:true})).toBeVisible();
  expect(await (await page.request.get('/api/workspace')).json()).toEqual(data);
});

test("exige credenciales, conserva la sesión y la revoca al salir", async ({ page, request, browser }) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect((await request.put("/api/workspace", { data: {} })).status()).toBe(401);
  await page.goto("/#/jornada");
  await expect(page.getByRole("heading", { name: "Work Track" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jornada", exact: true })).toHaveCount(0);
  await page.getByLabel("Usuario", { exact: true }).fill("alexis");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toHaveText("Usuario o contraseña incorrectos.");
  await expect(page.getByLabel("Usuario", { exact: true })).toHaveValue("alexis");
  await page.getByLabel("Contraseña", { exact: true }).fill("alexis123");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.locator(".session-user")).toHaveText("alexis");
  const authenticated = page.request;
  const before = await (await authenticated.get("/api/workspace")).json();
  await page.reload();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find(cookie => cookie.name === "worktrack_session");
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Strict");
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get("http://127.0.0.1:4174/api/workspace")).status()).toBe(401);
  await anonymous.close();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect((await authenticated.get("/api/session", { headers: { Cookie: `worktrack_session=${session.value}` } })).status()).toBe(401);
  await authenticated.post("/api/login", { data: { username: "alexis", password: "alexis123" } });
  expect(await (await authenticated.get("/api/workspace")).json()).toEqual(before);
  await page.setViewportSize({ width: 375, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/login-mobile.png" });
});

test("una sesión revocada vuelve a pedir acceso y conserva la pantalla al reingresar", async ({ page, context }) => {
  await page.clock.install();
  await context.request.post("/api/login", { data: { username: "alexis", password: "alexis123" } });
  await page.goto("/#/proyectos");
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  await context.request.post("/api/logout");
  await page.clock.runFor(1100);
  await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
  await page.getByLabel("Usuario", { exact: true }).fill("alexis");
  await page.getByLabel("Contraseña", { exact: true }).fill("alexis123");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("textbox", { name: "Nombre del proyecto" })).toBeVisible();
});

test('backlog persiste en SQLite, inicia en Jornada y desaparece al completar', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-26T10:00:00')});
  await page.clock.pauseAt(new Date('2026-10-26T10:00:00'));
  expect((await page.request.post('/api/login',{data:{username:'alexis',password:'alexis123'}})).ok()).toBeTruthy();
  const loaded = await page.request.get('/api/workspace');
  expect((await page.request.put('/api/workspace',{headers:{'If-Match':loaded.headers().etag},
    data:{version:2,tasks:[],days:{},projects:[{id:'p',name:'POC'}]}})).ok()).toBeTruthy();
  await page.goto('/#/backlog');
  await page.getByRole('button',{name:'+ Tarea',exact:true}).click();
  await page.getByLabel('Descripción de tarea',{exact:true}).fill('Pendiente SQLite');
  await chooseValue(page,page.getByRole('combobox',{name:'Proyecto de tarea',exact:true}),'p');
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.reload();
  await expect(page.getByLabel('Descripción de tarea',{exact:true})).toHaveValue('Pendiente SQLite');
  await page.getByRole('button',{name:'Iniciar Pendiente SQLite',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Guardado');
  await page.reload();
  await expect(page.getByRole('button',{name:'Terminar t1',exact:true})).toBeVisible();
  await page.clock.fastForward(15*60000);
  await page.getByRole('button',{name:'Terminar t1',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Guardado');
  const persisted = await (await page.request.get('/api/workspace')).json();
  expect(persisted.backlog).toHaveLength(0);
  expect(persisted.days['2026-10-26'].actual.blocks[0]).toMatchObject({start:'10:00',end:'10:15'});
  expect(persisted.days['2026-10-26'].actual.tasks[0].projectId).toBe('p');
  await page.reload();
  await page.getByRole('button',{name:'Backlog',exact:true}).click();
  await expect(page.locator('#backlog-list tr')).toHaveCount(0);
});
