import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';

type Rect = { x:number; y:number; w:number; h:number };
type Coin = { x:number; y:number; collected:boolean; sprite:Graphics };
const WORLD={width:3000,height:900,ground:760};
const platforms:Rect[]=[
  {x:0,y:760,w:510,h:140},{x:600,y:700,w:210,h:200},{x:890,y:615,w:210,h:285},{x:1170,y:710,w:140,h:190},{x:1400,y:630,w:240,h:270},{x:1730,y:525,w:160,h:375},{x:1990,y:650,w:240,h:250},{x:2320,y:560,w:150,h:340},{x:2560,y:690,w:440,h:210},
  {x:300,y:590,w:130,h:22},{x:690,y:510,w:120,h:22},{x:1000,y:430,w:150,h:22},{x:1290,y:505,w:120,h:22},{x:1550,y:390,w:120,h:22},{x:1870,y:370,w:140,h:22},{x:2180,y:440,w:130,h:22},{x:2470,y:350,w:160,h:22}
];
const spikes:Rect[]=[{x:510,y:738,w:90,h:22},{x:810,y:738,w:80,h:22},{x:1100,y:738,w:70,h:22},{x:1310,y:738,w:90,h:22},{x:1640,y:738,w:90,h:22},{x:1890,y:738,w:100,h:22},{x:2230,y:738,w:90,h:22},{x:2470,y:738,w:90,h:22}];
const coinPositions=[{x:365,y:545},{x:700,y:655},{x:750,y:465},{x:1055,y:385},{x:1235,y:665},{x:1345,y:460},{x:1585,y:345},{x:1810,y:480},{x:1935,y:325},{x:2180,y:600},{x:2250,y:395},{x:2520,y:305}];

async function init(){
const gameHost=document.querySelector<HTMLDivElement>('#game-container')!;
const app=new Application();
await app.init({resizeTo:gameHost,background:'#12243b',antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true});
gameHost.appendChild(app.canvas);
const world=new Container(),bg=new Container(),terrain=new Container(),objects=new Container();
app.stage.addChild(world);world.addChild(bg,terrain,objects);
const palette={sky:0x12243b,far:0x1a3551,block:0x21364d,edge:0x38516a,acid:0xc9fa49,white:0xeef3e8,danger:0xf06156};

function buildBackground(){
  bg.addChild(new Graphics().rect(0,0,WORLD.width,WORLD.height).fill(palette.sky));
  for(let i=0;i<42;i++){const x=(i*179)%WORLD.width,y=70+(i*83)%430;bg.addChild(new Graphics().circle(x,y,i%5===0?1.8:1).fill({color:0xd9e8dd,alpha:.18+(i%4)*.09}));}
  bg.addChild(new Graphics().circle(510,245,105).fill({color:0xc8e2dc,alpha:.08}).circle(510,245,72).fill({color:0xd8eee8,alpha:.06}));
  for(let i=0;i<22;i++){const x=i*155-80,h=110+(i*71)%220,tower=new Graphics().rect(x,WORLD.ground-h,120,h).fill({color:palette.far,alpha:.56});for(let wy=WORLD.ground-h+24;wy<WORLD.ground-15;wy+=30)for(let wx=x+20;wx<x+100;wx+=28)if((wx+wy+i)%3>1)tower.rect(wx,wy,5,8).fill({color:0x79a2aa,alpha:.14});bg.addChild(tower);}
  bg.addChild(new Graphics().rect(0,570,WORLD.width,230).fill({color:0x0b1728,alpha:.28}));
}
function buildTerrain(){
  platforms.forEach((p,i)=>{const g=new Graphics().rect(p.x,p.y,p.w,p.h).fill(i<9?palette.block:0x294159);g.rect(p.x,p.y,p.w,3).fill({color:palette.edge,alpha:.9});if(i<9)for(let x=p.x+18;x<p.x+p.w-10;x+=34)g.rect(x,p.y+18,1,Math.min(72,p.h-25)).fill({color:0x3a5064,alpha:.22});terrain.addChild(g);});
  spikes.forEach(s=>{const g=new Graphics();for(let x=s.x;x<s.x+s.w;x+=18)g.poly([x,s.y+s.h,x+9,s.y,x+18,s.y+s.h]).fill({color:palette.danger,alpha:.9});terrain.addChild(g);});
  terrain.addChild(new Graphics().rect(2850,570,8,120).fill(palette.acid).poly([2815,570,2854,525,2893,570]).stroke({color:palette.acid,width:4}).circle(2854,565,62).stroke({color:palette.acid,width:1,alpha:.3}));
  const sign=new Text({text:'BEACON  →',style:new TextStyle({fontFamily:'monospace',fontSize:11,fill:0x8193a5,letterSpacing:2})});sign.position.set(2660,650);terrain.addChild(sign);
}
buildBackground();buildTerrain();
const coins:Coin[]=coinPositions.map(p=>{const sprite=new Graphics().poly([0,-12,8,0,0,12,-8,0]).fill(palette.acid).stroke({color:0xf0ffc0,width:1});sprite.position.set(p.x,p.y);objects.addChild(sprite);return{...p,collected:false,sprite};});
const player=new Container(),body=new Graphics().roundRect(-13,-22,26,40,4).fill(palette.white).rect(-10,-17,20,14).fill(0x18283b).rect(-7,-14,4,4).fill(palette.acid).rect(3,-14,4,4).fill(palette.acid).rect(-10,18,8,7).fill(0x98a6ae).rect(2,18,8,7).fill(0x98a6ae),scarf=new Graphics().rect(-18,-12,10,5).fill(palette.acid);player.addChild(scarf,body);objects.addChild(player);

const spawn={x:110,y:700};
const state={x:spawn.x,y:spawn.y,vx:0,vy:0,w:26,h:46,onGround:false,onWall:0,jumps:0,running:false,finished:false,startTime:0,elapsed:0,coins:0};
const abilities={airJump:true,wallJump:true},keys={left:false,right:false,jump:false};let jumpQueued=false,cameraX=0;
const overlap=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const playerRect=(x=state.x,y=state.y):Rect=>({x:x-state.w/2,y:y-state.h/2,w:state.w,h:state.h});
function respawn(){state.x=spawn.x;state.y=spawn.y;state.vx=0;state.vy=0;state.jumps=0;}
function resetGame(){respawn();state.coins=0;state.finished=false;state.startTime=performance.now();state.elapsed=0;cameraX=0;coins.forEach(c=>{c.collected=false;c.sprite.visible=true;});document.querySelector('#coin-count')!.textContent='0';document.querySelector('#finish-overlay')!.classList.add('hidden');}
function jump(){if(state.onGround){state.vy=-620;state.onGround=false;state.jumps=1;playTone(220,.06);}else if(abilities.wallJump&&state.onWall!==0){state.vy=-560;state.vx=-state.onWall*360;state.jumps=1;playTone(260,.07);}else if(abilities.airJump&&state.jumps<2){state.vy=-550;state.jumps++;playTone(330,.07);}}
function physics(dt:number){
  const accel=state.onGround?2100:1350,max=285,friction=state.onGround?1900:480,dir=(keys.right?1:0)-(keys.left?1:0);
  if(dir)state.vx=Math.max(-max,Math.min(max,state.vx+dir*accel*dt));else{const dec=Math.min(Math.abs(state.vx),friction*dt);state.vx-=Math.sign(state.vx)*dec;}if(jumpQueued){jump();jumpQueued=false;}state.vy=Math.min(state.vy+1550*dt,760);
  state.x+=state.vx*dt;let r=playerRect();state.onWall=0;for(const p of platforms)if(overlap(r,p)){if(state.vx>0){state.x=p.x-state.w/2;state.onWall=1;}else if(state.vx<0){state.x=p.x+p.w+state.w/2;state.onWall=-1;}state.vx=0;r=playerRect();}if(abilities.wallJump&&state.onWall&&state.vy>170)state.vy=170;
  state.y+=state.vy*dt;r=playerRect();state.onGround=false;for(const p of platforms)if(overlap(r,p)){if(state.vy>0){state.y=p.y-state.h/2;state.onGround=true;state.jumps=0;}else if(state.vy<0)state.y=p.y+p.h+state.h/2;state.vy=0;r=playerRect();}
  if(state.x<14){state.x=14;state.vx=0;}if(state.x>WORLD.width-14){state.x=WORLD.width-14;state.vx=0;}if(state.y>WORLD.height+80||spikes.some(s=>overlap(playerRect(),s)))respawn();
  for(const c of coins)if(!c.collected&&Math.hypot(state.x-c.x,state.y-c.y)<36){c.collected=true;c.sprite.visible=false;state.coins++;document.querySelector('#coin-count')!.textContent=String(state.coins);playTone(580,.08);}if(state.x>2815&&state.y>500&&!state.finished)finish();
}
function finish(){state.finished=true;state.running=false;state.elapsed=performance.now()-state.startTime;playTone(440,.12);setTimeout(()=>playTone(660,.18),110);const formatted=formatTime(state.elapsed);document.querySelector('#finish-time')!.textContent=formatted;document.querySelector('#finish-coins')!.textContent=`${state.coins} / ${coins.length}`;const prev=Number(localStorage.getItem('skybound-best')||Infinity);if(state.elapsed<prev){localStorage.setItem('skybound-best',String(state.elapsed));document.querySelector('#best-time')!.textContent=formatted;}document.querySelector('#finish-overlay')!.classList.remove('hidden');}
function renderGame(dt:number){const scale=Math.max(.72,Math.min(1.12,app.screen.height/WORLD.height*1.05));world.scale.set(scale);const viewW=app.screen.width/scale,target=Math.max(0,Math.min(WORLD.width-viewW,state.x-viewW*.38));cameraX+=(target-cameraX)*Math.min(1,dt*5.5);world.x=-cameraX*scale;world.y=(app.screen.height-WORLD.height*scale)/2;bg.x=cameraX*.12;player.position.set(state.x,state.y);player.rotation=Math.max(-.08,Math.min(.08,state.vx/2200));scarf.scale.x=state.vx>0?-1:1;coins.forEach((c,i)=>{c.sprite.rotation+=dt*(1.4+i%3*.2);c.sprite.y=c.y+Math.sin(performance.now()/420+i)*5;});}
app.ticker.add(t=>{const dt=Math.min(t.deltaMS/1000,.032);if(state.running&&!state.finished){physics(dt);state.elapsed=performance.now()-state.startTime;}renderGame(dt);});
function formatTime(ms:number){const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60,cs=Math.floor(ms/10)%100;return`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;}const best=Number(localStorage.getItem('skybound-best'));if(best)document.querySelector('#best-time')!.textContent=formatTime(best);
function setKey(code:string,on:boolean){if(['ArrowLeft','KeyA'].includes(code))keys.left=on;if(['ArrowRight','KeyD'].includes(code))keys.right=on;if(['ArrowUp','KeyW','Space'].includes(code)){if(on&&!keys.jump)jumpQueued=true;keys.jump=on;}}
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();setKey(e.code,true);if(e.code==='KeyR'&&state.running)resetGame();});addEventListener('keyup',e=>setKey(e.code,false));
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button=>{const name=button.dataset.key!;const on=(e:Event)=>{e.preventDefault();if(name==='jump'){jumpQueued=true;keys.jump=true;}else keys[name as 'left'|'right']=true;},off=(e:Event)=>{e.preventDefault();if(name==='jump')keys.jump=false;else keys[name as 'left'|'right']=false;};button.addEventListener('pointerdown',on);button.addEventListener('pointerup',off);button.addEventListener('pointercancel',off);button.addEventListener('pointerleave',off);});
let audioEnabled=true,audioCtx:AudioContext|null=null;function playTone(freq:number,duration:number){if(!audioEnabled)return;audioCtx??=new AudioContext();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);}
document.querySelector('#start-button')!.addEventListener('click',()=>{document.querySelector('#start-overlay')!.classList.add('hidden');state.running=true;resetGame();});document.querySelector('#replay-button')!.addEventListener('click',()=>{state.running=true;resetGame();});document.querySelector('#sound-button')!.addEventListener('click',e=>{audioEnabled=!audioEnabled;(e.currentTarget as HTMLElement).style.opacity=audioEnabled?'1':'.35';});
const drawer=document.querySelector('#settings-drawer')!,scrim=document.querySelector('#drawer-scrim')!;function setDrawer(open:boolean){drawer.classList.toggle('open',open);scrim.classList.toggle('open',open);drawer.setAttribute('aria-hidden',String(!open));}document.querySelector('#settings-button')!.addEventListener('click',()=>setDrawer(true));document.querySelector('#close-settings')!.addEventListener('click',()=>setDrawer(false));scrim.addEventListener('click',()=>setDrawer(false));document.querySelector<HTMLInputElement>('#air-jump-toggle')!.addEventListener('change',e=>abilities.airJump=(e.target as HTMLInputElement).checked);document.querySelector<HTMLInputElement>('#wall-jump-toggle')!.addEventListener('change',e=>abilities.wallJump=(e.target as HTMLInputElement).checked);renderGame(0);
}

void init();
