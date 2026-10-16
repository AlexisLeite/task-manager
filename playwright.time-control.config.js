import {defineConfig} from '@playwright/test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const workspace=mkdtempSync(join(tmpdir(),'worktrack-time-control-'));
export default defineConfig({
  testDir:'./verification',testMatch:'time-control.spec.js',workers:1,
  reporter:[['list'],['html',{outputFolder:'test-results/time-control-isolated/report',open:'never'}]],
  outputDir:'test-results/time-control-isolated/artifacts',
  use:{baseURL:'http://127.0.0.1:5188',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --port 5188 --strictPort',url:'http://127.0.0.1:5188/api/health',reuseExistingServer:false,env:{WORKTRACK_DB:join(workspace,'test.sqlite')}},
  metadata:{workspace},
});
