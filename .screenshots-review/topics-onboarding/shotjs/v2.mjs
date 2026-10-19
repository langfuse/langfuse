import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [dir, out] = process.argv.slice(2);
const files = [['V2-1a-empty',1280,800],['V2-1b-empty',1280,800],['V2-2-setup',1280,800],['V2-3-advanced',1280,800],['V2-4-traces',1280,800],['V2-5-running',1280,800],['V2-6-results',1280,800],['V2-7-header',1280,640],['V2-8-auto',1280,800]];
const b = await chromium.launch();
for (const [f,w,h] of files) {
  const p = await b.newPage({ viewport: { width:w, height:h }, deviceScaleFactor: 1.5 });
  await p.goto('file://' + dir + '/' + f + '.dc.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: out + '/' + f + '.png' });
  await p.close();
}
await b.close();
