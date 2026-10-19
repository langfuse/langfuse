import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [dir, out] = process.argv.slice(2);
const files = [
  ['Main','1280','800'],['A-empty','1280','800'],['A-setup','1280','800'],['B-empty','1280','800'],['B-running','1280','800'],['C-empty','1280','800'],['C-setup','1280','800'],['D-empty','1280','800'],['E-prism','1200','630'],['F-constellations','1200','630'],['G-sorting','1200','630']];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
for (const [f,w,h] of files) {
  const p = await b.newPage({ viewport: { width:+w, height:+h }, deviceScaleFactor: 1.5 });
  await p.goto('file://' + dir + '/' + f + '.dc.html');
  await p.waitForTimeout(400);
  await p.screenshot({ path: out + '/' + f + '.png' });
  await p.close();
}
await b.close();
