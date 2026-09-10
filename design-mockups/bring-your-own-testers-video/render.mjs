import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import sharp from 'sharp';

// Standalone video artwork only. No product routes or components are changed.
const out = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const root = path.resolve(out, '../..');
const css = fs.readFileSync(path.join(root, 'design-system/tokens/generated/tokens.css'), 'utf8');
const token = (name) => css.match(new RegExp(`--ds-semantic-${name}: ([^;]+);`))[1];
const col = (name) => token(`color-${name}`);
const C = {
  bg: col('action-tint'), white: col('surface-default'), ink: col('text-primary'),
  muted: col('text-secondary'), faint: col('text-tertiary'), border: col('border-default'),
  soft: col('background-subtle'), blue: col('action-primary'), hover: col('action-primary-hover'),
  green: col('status-success'), greenBg: col('status-success-tint'),
};
const R = parseInt(token('radius-surface'));
const controlR = parseInt(token('radius-control'));
const web = process.argv.includes('--web');
const W = web ? 1440 : 1280, H = web ? 1125 : 1000, fps = 30, seconds = 7;
const crop = {left: 0, top: 82, width: 1440, height: 960};
const outputName = web ? 'bring-your-own-testers-master.mkv' : 'bring-your-own-testers.mp4';
const textCache = new Map();
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
async function text(s, x, y, size = 16, color = C.ink, weight = 'Regular') {
  const key = JSON.stringify([s, size, color, weight]);
  if (!textCache.has(key)) {
    const fontfile = path.join(root, `node_modules/geist/dist/fonts/geist-sans/Geist-${weight}.ttf`);
    const {data, info} = await sharp({text: {
      text: `<span foreground="${color}">${esc(s)}</span>`,
      font: `Geist ${weight === 'SemiBold' ? 'Semi-Bold' : weight} ${size}`, fontfile, dpi: 72 * W / 640, rgba: true,
    }}).png().toBuffer({resolveWithObject: true});
    textCache.set(key, {uri: data.toString('base64'), w: info.width * 640 / W, h: info.height * 640 / W});
  }
  const t = textCache.get(key);
  return `<image x="${x}" y="${y}" width="${t.w}" height="${t.h}" href="data:image/png;base64,${t.uri}"/>`;
}
const rect = (x,y,w,h,fill,r=0,stroke='none') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const line = (x1,y1,x2,y2,color=C.border) => `<path d="M${x1} ${y1}H${x2}" stroke="${color}"/>`;
const icon = (type,x,y,color=C.ink,size=20) => {
  const paths = {
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z M22 2 11 13"/>',
    link: '<path d="m10 13 4-4 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M13 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    close: '<path d="m6 6 12 12 M18 6 6 18"/>',
  };
  return `<g transform="translate(${x},${y}) scale(${size/24})" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</g>`;
};
const shell = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 640 500"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="${C.ink}" flood-opacity="0.08"/></filter></defs>${rect(0,0,640,500,C.bg)}${body}</svg>`;
const card = (x,y,w,h) => `<g filter="url(#shadow)">${rect(x,y,w,h,C.white,R,C.border)}</g>`;
async function share(state) {
  const copied = state === 'copied';
  let s = card(40,96,560,308);
  s += await text('Share Palette Pilot',64,120,24,C.ink,'SemiBold');
  s += await text('Anyone with this link can complete your live test.',64,160,16,C.muted);
  s += await text('Share test link',64,212,16,C.ink,'Medium');
  s += rect(64,240,512,48,C.white,controlR,C.border);
  s += await text('test4test.io/test/palette-pilot',80,254,16,C.muted);
  s += rect(64,300,512,48,state === 'hover' ? C.soft : C.white,controlR,C.border);
  s += icon(copied ? 'check' : 'copy',264,314,copied ? C.green : C.ink,20);
  s += await text(copied ? 'Copied' : 'Copy link',294,314,16,copied ? C.green : C.ink,'Medium');
  return shell(s);
}
async function message(state) {
  const sent = state === 'sent';
  let s = card(40,64,560,372);
  s += icon('mail',64,86,C.faint,20);
  s += await text('New message',96,86,16,C.ink,'SemiBold');
  s += icon('close',556,86,C.faint,16);
  s += line(40,124,600,124);
  s += await text('To',64,143,14,C.faint);
  s += rect(96,134,64,32,C.soft,controlR);
  s += await text('Alex',112,143,14,C.ink,'Medium');
  s += line(64,176,576,176);
  s += await text('Can you try Palette Pilot?',64,194,16,C.ink,'Medium');
  s += line(64,224,576,224);
  s += await text('Hey Alex,',64,248,16);
  s += await text('Can you please try out my app?',64,280,16);
  if (state !== 'empty') {
    s += await text('test4test.io/test/palette-pilot',64,320,16,C.blue);
    s += `<path d="M64 340H269" stroke="${C.blue}" stroke-width="0.6"/>`;
  }
  if (state === 'empty') s += `<path d="M64 319v21" stroke="${C.ink}"/>`;
  s += rect(64,368,112,44,sent ? C.greenBg : state === 'hover' ? C.hover : C.blue,controlR);
  s += icon(sent ? 'check' : 'send',80,380,sent ? C.green : C.white,20);
  s += await text(sent ? 'Sent' : 'Send',112,382,16,sent ? C.green : C.white,'Medium');
  if (sent) s += await text('Message sent',192,382,14,C.green);
  return shell(s);
}
const scenes = {};
for (const s of ['idle','hover','copied']) scenes[`share-${s}`] = await sharp(Buffer.from(await share(s))).png().toBuffer();
for (const s of ['empty','pasted','hover','sent']) scenes[`message-${s}`] = await sharp(Buffer.from(await message(s))).png().toBuffer();
fs.writeFileSync(path.join(out,'poster.png'),scenes['share-idle']);
if (web) await sharp(scenes['share-idle']).extract(crop).png().toFile(path.join(out,'web-poster.png'));
const ease = (p) => { p=Math.max(0,Math.min(1,p)); return p*p*(3-2*p); };
const lerp = (a,b,p) => a+(b-a)*p;
function cursor(x,y,alpha=1,press=0) {
  return `<g opacity="${alpha}" transform="translate(${x},${y}) scale(${press ? .92 : 1})"><path d="M0 0v23l6-6 5 11 5-2-5-10h9Z" fill="${C.ink}" stroke="${C.white}" stroke-width="1.5" stroke-linejoin="round"/></g>`;
}
const encoding = web ? ['-vf','crop=1440:960:0:82','-c:v','ffv1'] : ['-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart'];
const ffmpeg = spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0','-an',...encoding,path.join(out,outputName)],{windowsHide:true,stdio:['pipe','inherit','inherit']});
ffmpeg.stdin.on('error', () => {});
const samples = [0,1.55,2.65,3.5,4.55,5.7];
for(let frame=0; frame<fps*seconds; frame++) {
  const t=frame/fps;
  let name='share-idle',x=554,y=421,a=0,press=0;
  if(t>=.4 && t<1.25){const p=ease((t-.4)/.75); x=lerp(554,338,p);y=lerp(421,326,p);a=Math.min(1,(t-.4)/.18);}
  if(t>=1.1 && t<1.4)name='share-hover';
  if(t>=1.25 && t<2.25){x=338;y=326;a=1;press=t<1.4?1:0;}
  if(t>=1.4)name='share-copied';
  if(t>=2.25){name='message-empty';const p=ease((t-2.45)/.65);x=lerp(338,74,p);y=lerp(326,331,p);a=1;}
  if(t>=3.1){name='message-pasted';x=74;y=331;a=1;}
  if(t>=3.55){const p=ease((t-3.55)/.8);x=lerp(74,131,p);y=lerp(331,390,p);}
  if(t>=4.28)name='message-hover';
  if(t>=4.4 && t<4.55)press=1;
  if(t>=4.55)name='message-sent';
  if(t>=4.9){const p=ease((t-4.9)/.6);x=lerp(131,265,p);y=lerp(390,457,p);a=1-p;}
  let layers=`<image width="640" height="500" href="data:image/png;base64,${scenes[name].toString('base64')}"/>`;
  if(t>=2.25 && t<2.45)layers+=`<image width="640" height="500" opacity="${1-(t-2.25)/.2}" href="data:image/png;base64,${scenes['share-copied'].toString('base64')}"/>`;
  layers+=cursor(x,y,a,press);
  if(t>=6.7) layers+=`<image width="640" height="500" opacity="${ease((t-6.7)/.3)}" href="data:image/png;base64,${scenes['share-idle'].toString('base64')}"/>`;
  const png=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 640 500">${layers}</svg>`)).png().toBuffer();
  const sample=samples.findIndex(n=>Math.round(n*fps)===frame);
  if(sample>=0)fs.writeFileSync(path.join(out,`check-${sample}.png`),png);
  if(!ffmpeg.stdin.write(png))await once(ffmpeg.stdin,'drain');
}
ffmpeg.stdin.end();
const [code]=await once(ffmpeg,'exit');
if(code)throw new Error(`ffmpeg exited ${code}`);
console.log(`Rendered ${seconds}s at ${W}x${web ? crop.height : H}, ${fps}fps: ${path.join(out,outputName)}`);
