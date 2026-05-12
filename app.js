//                             CONFIG                            
const ROUND_URL = "https://script.google.com/macros/s/AKfycbx49j_mbDGH52UMt_04dCNCLWTuYOEJfiC_FiemPbF7-61WHI4TVTH2nLbKMKgmqoPNDg/exec";
const PRAC_URL  = "https://script.google.com/macros/s/AKfycbzJpuhHgvzm9Jeai-qWDiQrHdrYBsbtL7Z2upClXo2LKdJwwR-kMuVbvAQI-qrmelgd3A/exec";

//                             CLUB DATA                            
const CLUBS_MAP = {
  Woods:["Driver","3W"], Hybrids:["4H"],
  Irons:["3i","4i","5i","6i","7i","8i","9i"],
  Wedges:["PW","52°","58°"],
};
const CLUB_LIST  = Object.values(CLUBS_MAP).flat();
const SWINGS     = ["Full","90%","3/4","1/2","1/4"];
const SHAPES     = ["Pull Draw","Pull","Pull Fade","Fade","Straight","Draw","Push Draw","Push","Push Fade"];
const SHOT_TYPES = ["Tee","Lay-up","Approach","Pitch","Chip","Bunker","Putt"];
const LAND_ZONES = ["Fairway","Semi-rough","Rough","Fairway Bunker","Bunker","Penalty Area","OB"];
const MISS_DIRS  = ["Long Left","Long","Long Right","Left","Short Left","Short","Short Right"];
const LIE_TYPES  = ["Tee","Fairway","Semi-rough","Rough","Fairway Bunker","Greenside Bunker","Fringe","Green"];
const PUTT_SLOPES= ["Uphill","Flat","Downhill"];
const PUTT_BREAKS= ["Left to Right","Straight","Right to Left"];
const COLORS = {
  Driver:"#4fc3f7","3W":"#4fc3f7","4H":"#ff8a65",
  "3i":"#81c784","4i":"#81c784","5i":"#e53935","6i":"#e53935",
  "7i":"#ce93d8","8i":"#ffb74d","9i":"#ffb74d",
  PW:"#a5d6a7","52°":"#80cbc4","58°":"#80cbc4",
};
function clr(c){return COLORS[c]||"#5ba85e";}

//                             STATE                            
// Practice
let pShots=[], pBag=gl("p-bag")||[...CLUB_LIST];
let pSelClub=CLUB_LIST.find(c=>pBag.includes(c))||"Driver";
let pSelSwing="Full", pSelShape="Straight", pSelDir="Center";
let pCurView="log", pDashClub="all", pPeriod="all", pSwingF="all", pDistF="both";
let pEditIdx=null, pEditClub="", pEditSwing="", pEditShape="";

// Rounds
let courses=[], rounds=[], rHoles=[], rShots=[];
let curRound=null, curHoleNo=1, rCurView="setup", rCondition="Sunny", rSelTee="";

// Shot logger
let slHole=null, slHoleShots=[], slSelType="Tee";
let slClub="Driver", slSwing="Full", slShape="Straight";
let slLZ="", slLie="", slHitGreen=null, slMissDir="", slMissDist=0;
let slPSlope="", slPBreak="", slPResult="", slPMissSide="";

// Dashboard
let dCurView="stats", dRoundsF="all";

//                             UTILS                            
function gl(k){try{const v=localStorage.getItem("gtx_"+k);return v?JSON.parse(v):null;}catch(e){return null;}}
function gs(k,v){try{localStorage.setItem("gtx_"+k,JSON.stringify(v));}catch(e){}}
function uid(){return Date.now()+"_"+Math.random().toString(36).slice(2,6);}
function fmtD(iso){return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}
function avg(arr){return arr.length?Math.round(arr.reduce((a,b)=>a+b,0)/arr.length):0;}
function pct(n,d){return d?Math.round(n/d*100):0;}

function fetchT(url,ms=15000){
  return Promise.race([
    fetch(url,{redirect:"follow",mode:"cors"}).catch(function(e){
      // Try no-cors as fallback for reading (will give opaque response)
      return fetch(url,{redirect:"follow"});
    }),
    new Promise((_,r)=>setTimeout(()=>r(new Error("Timeout after "+ms+"ms")),ms))
  ]);
}
async function api(url,action,params={}){
  let q="action="+action;
  for(const[k,v]of Object.entries(params))
    q+="&"+k+"="+encodeURIComponent(typeof v==="object"?JSON.stringify(v):String(v));
  const res=await fetchT(url+"?"+q);
  const text=await res.text();
  if(!text||text.trim()==="") throw new Error("Empty response from server");
  try{ return JSON.parse(text); }
  catch(e){ throw new Error("Invalid JSON: "+text.slice(0,80)); }
}

function banner(msg,isErr,id="global-banner"){
  const el=document.getElementById(id);
  if(!el)return;
  el.textContent=msg; el.className="banner "+(isErr?"err":"ok");
  el.style.display="block";
  clearTimeout(el._t); el._t=setTimeout(()=>el.style.display="none",isErr?6000:3000);
}
function dot(state,label){
  const d=document.getElementById("home-dot"),l=document.getElementById("home-sync");
  if(d)d.className="sync-dot "+state; if(l)l.textContent=label;
}

//                             NAV                            
function goTo(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-"+page).classList.add("active");
  window.scrollTo(0,0);
  if(page==="practice") pInit();
  if(page==="courses")  renderCourses();
  if(page==="round")    rInit();
  if(page==="dashboard") dInit();
  if(page==="home")     updateHome();
}

//                             BOOT                            
function normP(s){return{...s,carryDistance:Number(s.carryDistance)||0,totalDistance:Number(s.totalDistance)||0,distanceOffline:Number(s.distanceOffline)||0};}

function showApp(){
  try{
    const ls=document.getElementById("loading-screen");
    const ph=document.getElementById("page-home");
    if(ls) ls.style.display="none";
    if(ph) ph.classList.add("active");
    updateHome();
  }catch(e){ console.error("showApp error:",e); }
}

async function safeApi(url, action){
  try{
    const d = await api(url, action);
    return d;
  }catch(e){
    console.warn("API call failed ("+action+"):", e.message);
    return null;
  }
}

async function boot(){
  // Always show the app immediately -- never block on network
  try{
    pShots  = (gl("p-shots")||[]).map(normP);
    courses = gl("courses")||[];
    rounds  = gl("rounds") ||[];
    rHoles  = gl("r-holes")||[];
    rShots  = gl("r-shots")||[];
    pBag    = gl("p-bag")  ||[...CLUB_LIST];
  }catch(e){ console.warn("localStorage read failed:",e); }

  showApp();

  // Sync in background -- never crashes the UI
  setTimeout(async function(){
    dot("s","Syncing...");
    let ok=true;

    const pd = await safeApi(PRAC_URL,"load");
    if(pd){
      try{
        if(pd.shots && Array.isArray(pd.shots)){pShots=pd.shots.map(normP);gs("p-shots",pShots);}
        if(pd.bag && Array.isArray(pd.bag) && pd.bag.length){pBag=pd.bag;gs("p-bag",pBag);}
      }catch(e){ok=false;}
    }else{ok=false;}

    const rd = await safeApi(ROUND_URL,"load");
    if(rd){
      try{
        if(rd.courses && Array.isArray(rd.courses)){courses=rd.courses;gs("courses",courses);}
        if(rd.rounds  && Array.isArray(rd.rounds)) {rounds=rd.rounds;  gs("rounds",rounds);}
        if(rd.holes   && Array.isArray(rd.holes))  {rHoles=rd.holes;   gs("r-holes",rHoles);}
        if(rd.shots   && Array.isArray(rd.shots))  {rShots=rd.shots;   gs("r-shots",rShots);}
      }catch(e){ok=false;}
    }else{ok=false;}

    dot(ok?"ok":"err", ok?"All data synced":"Using local data (sheet offline)");
    try{ updateHome(); }catch(e){}
  }, 100);
}

function updateHome(){
  const hcp=calcHcp();
  const hcpEl=document.getElementById("home-hcp");
  if(hcp!==null&&hcpEl){
    hcpEl.style.display="block";
    document.getElementById("home-hcp-val").textContent=hcp.toFixed(1);
  }
  const ps=document.getElementById("home-prac-sub");
  if(ps)ps.textContent=pShots.length+" shots logged";
  const rs=document.getElementById("home-round-sub");
  if(rs)rs.textContent=rounds.length+" rounds played";
  const cs=document.getElementById("home-course-sub");
  if(cs)cs.textContent=courses.length+" courses saved";
}

//                             PRACTICE                            
function pInit(){
  if(!CLUB_LIST.some(c=>pBag.includes(c)))pBag=[...CLUB_LIST];
  pSelClub=CLUB_LIST.find(c=>pBag.includes(c))||"Driver";
  pRenderClubs(); pRenderSwings(); pRenderShapes(); pSetDir("Center"); pUpdateHdr();
  pView("log");
}
function pUpdateHdr(){
  const el=document.getElementById("ph-sub");
  if(el)el.textContent=pBag.length+" clubs · "+pShots.length+" shots";
}
function pView(v){
  pCurView=v;
  ["log","history","dashboard"].forEach(x=>{
    document.getElementById("pv-"+x).style.display=x===v?"block":"none";
    const nb=document.getElementById("pnav-"+x);
    if(nb)nb.classList.toggle("active",x===v);
  });
  if(v==="history")  pRenderHist();
  if(v==="dashboard") pRenderDash();
}

function pRenderClubs(){
  const ord=CLUB_LIST.filter(c=>pBag.includes(c));
  const el=document.getElementById("p-club-btns");
  if(!ord.length){el.innerHTML='<span style="color:#3a5a3a;font-size:11px">No clubs -- tap 🎒</span>';return;}
  if(!ord.includes(pSelClub))pSelClub=ord[0];
  el.innerHTML=ord.map(c=>{const col=clr(c),a=c===pSelClub;
    return`<button class="pill" onclick="pPickC('${c}')"
      style="border-color:${a?col:"#1e3a1f"};background:${a?col+"22":"transparent"};
        color:${a?col:"#3a5a3a"};font-weight:${a?700:400}">${c}</button>`;}).join("");
}
function pPickC(c){pSelClub=c;pRenderClubs();}
function pRenderSwings(){
  document.getElementById("p-swing-btns").innerHTML=
    SWINGS.map(s=>`<button class="tog${s===pSelSwing?" active":""}" onclick="pPickSw('${s}')">${s}</button>`).join("");
}
function pPickSw(s){pSelSwing=s;pRenderSwings();}
function pRenderShapes(){
  document.getElementById("p-shape-btns").innerHTML=
    SHAPES.map(s=>`<button class="tog${s===pSelShape?" active":""}" onclick="pPickSh('${s}')">${s}</button>`).join("");
}
function pPickSh(s){pSelShape=s;pRenderShapes();}
function pSetDir(d){
  pSelDir=d;
  const cols={Left:"#6b8cba",Center:"#5ba85e",Right:"#ba6b6b"};
  ["Left","Center","Right"].forEach(x=>{
    const el=document.getElementById("pd-"+x);if(!el)return;
    const a=x===d,c=cols[x];
    el.style.borderColor=a?c:"#1e3a1f"; el.style.background=a?c+"22":"transparent"; el.style.color=a?c:"#3a5a3a";
  });
}

async function pLogShot(){
  const cv=document.getElementById("p-carry");
  const carry=parseFloat(cv.value);
  if(!cv.value||isNaN(carry)||carry<=0){
    const e=document.getElementById("p-err");
    e.textContent="Enter a carry distance first."; e.style.display="block";
    setTimeout(()=>e.style.display="none",3000); return;
  }
  const shot={id:uid(),timestamp:new Date().toISOString(),club:pSelClub,swingType:pSelSwing,
    carryDistance:carry, totalDistance:parseFloat(document.getElementById("p-total").value)||0,
    shotShape:pSelShape, offlineDirection:pSelDir,
    distanceOffline:parseFloat(document.getElementById("p-offline").value)||0};
  pShots.unshift(shot); gs("p-shots",pShots);
  cv.value=""; document.getElementById("p-total").value=""; document.getElementById("p-offline").value="";
  pUpdateHdr();
  const btn=document.getElementById("p-log-btn");
  btn.textContent="✓ SHOT SAVED"; setTimeout(()=>btn.textContent="LOG SHOT",2000);
  const se=document.getElementById("p-sync");
  se.innerHTML='<span class="sync-dot s"></span>Saving...';
  try{
    const r=await api(PRAC_URL,"saveShot",{data:shot});
    se.innerHTML=r.ok?'<span class="sync-dot ok"></span>Saved to sheet'
      :'<span class="sync-dot err"></span>Sync failed';
  }catch(e){se.innerHTML='<span class="sync-dot err"></span>Saved locally';}
}

function pOpenBag(){pRenderBag();document.getElementById("p-bag-modal").classList.add("open");}
function pCloseBag(){
  document.getElementById("p-bag-modal").classList.remove("open");
  gs("p-bag",pBag); pRenderClubs(); pUpdateHdr();
  api(PRAC_URL,"saveBag",{data:pBag}).catch(()=>{});
}
function pRenderBag(){
  document.getElementById("p-bag-cnt").textContent=pBag.length+" clubs selected";
  let html="";
  Object.entries(CLUBS_MAP).forEach(([cat,clubs])=>{
    html+=`<div style="margin-bottom:14px"><div style="font-size:8px;color:#3a5a3a;letter-spacing:0.2em;margin-bottom:6px;text-transform:uppercase">${cat}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">`;
    clubs.forEach(c=>{const a=pBag.includes(c),col=clr(c);
      html+=`<button class="pill" onclick="pTogBag('${c}')"
        style="border-color:${a?col:"#1e3a1f"};background:${a?col+"22":"transparent"};
          color:${a?col:"#2a4a2a"};font-weight:${a?700:400}">${a?"✓ ":""}${c}</button>`;
    });
    html+=`</div></div>`;
  });
  document.getElementById("p-bag-clubs").innerHTML=html;
}
function pTogBag(c){pBag=pBag.includes(c)?pBag.filter(x=>x!==c):[...pBag,c];pRenderBag();}

function pRenderHist(){
  document.getElementById("p-hist-t").textContent="-- HISTORY ("+pShots.length+") --";
  if(!pShots.length){
    document.getElementById("p-hist-list").innerHTML='<div style="text-align:center;padding:40px;color:#2a4a2a;font-size:12px">No shots yet.</div>';return;
  }
  document.getElementById("p-hist-list").innerHTML=pShots.map((s,i)=>{
    const col=clr(s.club);
    const dc=s.offlineDirection==="Left"?"#6b8cba":s.offlineDirection==="Right"?"#ba6b6b":"#5ba85e";
    const dl=s.offlineDirection!=="Center"?s.distanceOffline+"y "+s.offlineDirection:"On line";
    return`<div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="display:flex;align-items:baseline;gap:6px">
          <span style="font-weight:700;font-size:14px;color:${col}">${s.club}</span>
          <span style="font-size:9px;color:#3a5a3a">${s.swingType}</span></div>
        <button class="btn btn-outline btn-sm" onclick="pOpenEdit(${i})">EDIT</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px">
        <div><div style="font-size:15px;font-weight:700;color:#5ba85e">${s.carryDistance}<span style="font-size:8px;color:#3a5a3a">y</span></div><div style="font-size:8px;color:#3a5a3a">CARRY</div></div>
        <div><div style="font-size:15px;font-weight:700;color:#e8b84b">${s.totalDistance||"--"}</div><div style="font-size:8px;color:#3a5a3a">TOTAL</div></div>
        <div><div style="font-size:10px;color:#8aab8a">${s.shotShape}</div><div style="font-size:9px;color:${dc}">${dl}</div></div>
        <div style="text-align:right;font-size:8px;color:#2a4a2a">${fmtD(s.timestamp)}</div>
      </div></div>`;
  }).join("");
}

function pOpenEdit(i){
  pEditIdx=i; const s=pShots[i];
  pEditClub=s.club; pEditSwing=s.swingType; pEditShape=s.shotShape;
  const rClubs=()=>document.getElementById("pe-clubs").innerHTML=
    CLUB_LIST.filter(c=>pBag.includes(c)).map(c=>{const col=clr(c),a=c===pEditClub;
      return`<button class="pill" onclick="pEC('${c}')" style="border-color:${a?col:"#1e3a1f"};background:${a?col+"22":"transparent"};color:${a?col:"#3a5a3a"};font-weight:${a?700:400}">${c}</button>`;
    }).join("");
  const rSwings=()=>document.getElementById("pe-swings").innerHTML=
    SWINGS.map(sw=>`<button class="tog${sw===pEditSwing?" active":""}" onclick="pES('${sw}')">${sw}</button>`).join("");
  const rShapes=()=>document.getElementById("pe-shapes").innerHTML=
    SHAPES.map(sh=>`<button class="tog${sh===pEditShape?" active":""}" onclick="pESh('${sh}')">${sh}</button>`).join("");
  window.pEC=c=>{pEditClub=c;rClubs();}; window.pES=s=>{pEditSwing=s;rSwings();}; window.pESh=s=>{pEditShape=s;rShapes();};
  document.getElementById("p-edit-body").innerHTML=`
    <div class="card"><div class="slabel">Club</div><div id="pe-clubs" style="display:flex;flex-wrap:wrap;gap:5px"></div></div>
    <div class="card"><div class="slabel">Swing</div><div id="pe-swings" style="display:flex;flex-wrap:wrap;gap:5px"></div></div>
    <div class="card">
      <div class="g2" style="gap:12px">
        <div><div class="slabel">Carry (yds)</div><input id="pe-carry" class="big-input" type="tel" inputmode="decimal" value="${s.carryDistance}" style="font-size:20px"/></div>
        <div><div class="slabel">Total (yds)</div><input id="pe-total" class="big-input" type="tel" inputmode="decimal" value="${s.totalDistance||""}" style="font-size:20px;border-bottom-color:#e8b84b"/></div>
      </div></div>
    <div class="card" style="margin-bottom:12px"><div class="slabel">Shape</div><div id="pe-shapes" style="display:flex;flex-wrap:wrap;gap:5px"></div></div>`;
  rClubs(); rSwings(); rShapes();
  document.getElementById("p-edit-modal").classList.add("open");
}
function closePEdit(){document.getElementById("p-edit-modal").classList.remove("open");pEditIdx=null;}
async function savePEdit(){
  if(pEditIdx===null)return;
  const upd={...pShots[pEditIdx],club:pEditClub,swingType:pEditSwing,shotShape:pEditShape,
    carryDistance:parseFloat(document.getElementById("pe-carry").value)||0,
    totalDistance:parseFloat(document.getElementById("pe-total").value)||0};
  pShots[pEditIdx]=normP(upd); gs("p-shots",pShots);
  closePEdit(); pRenderHist(); banner("Shot updated","","p-banner");
  try{await api(PRAC_URL,"editShot",{data:upd});}catch(e){banner("Saved locally","err","p-banner");}
}
async function deletePShot(){
  if(pEditIdx===null||!confirm("Delete this shot?"))return;
  const shot=pShots[pEditIdx]; pShots.splice(pEditIdx,1); gs("p-shots",pShots);
  pUpdateHdr(); closePEdit(); pRenderHist();
  try{await api(PRAC_URL,"deleteShot",{id:shot.id});}catch(e){}
}

//    Practice dashboard                                           
function pPer(p){pPeriod=p;["all","7d","30d","90d"].forEach(x=>{const el=document.getElementById("pf-"+x);if(el)el.classList.toggle("active",x===p);});pRenderDash();}
function pSw(s){pSwingF=s;["all","Full","90%","3/4","1/2","1/4"].forEach(x=>{const el=document.getElementById("psf-"+x);if(el)el.classList.toggle("active",x===s);});pRenderDash();}
function pDt(d){pDistF=d;["both","carry","total"].forEach(x=>{const el=document.getElementById("pdt-"+x);if(el)el.classList.toggle("active",x===d);});pRenderDash();}

function pGetFilt(){
  const now=new Date();
  return pShots.filter(s=>{
    const d=new Date(s.timestamp);
    const inP=pPeriod==="7d"?(now-d)<=7*86400000:pPeriod==="30d"?(now-d)<=30*86400000:pPeriod==="90d"?(now-d)<=90*86400000:true;
    return inP&&(pSwingF==="all"||s.swingType===pSwingF);
  });
}
function pGetCS(filt){
  const by={};filt.forEach(s=>{(by[s.club]=by[s.club]||[]).push(s);});
  return CLUB_LIST.filter(c=>by[c]).map(club=>{
    const arr=by[club];
    const aC=Math.round(arr.reduce((a,b)=>a+b.carryDistance,0)/arr.length);
    const tA=arr.filter(s=>s.totalDistance>0);
    const aT=tA.length?Math.round(tA.reduce((a,b)=>a+b.totalDistance,0)/tA.length):0;
    const mxC=Math.max(...arr.map(s=>s.carryDistance));
    const mnC=Math.min(...arr.map(s=>s.carryDistance));
    const aOff=Math.round(arr.reduce((a,b)=>a+b.distanceOffline,0)/arr.length);
    return{club,count:arr.length,avgC:aC,avgT:aT,maxC:mxC,minC:mnC,avgOff:aOff};
  });
}

function pRenderDash(){
  const filt=pGetFilt(), cs=pGetCS(filt);
  const ds=pDashClub==="all"?filt:filt.filter(s=>s.club===pDashClub);
  const aC=ds.length?Math.round(ds.reduce((a,b)=>a+b.carryDistance,0)/ds.length):"--";
  const tS=ds.filter(s=>s.totalDistance>0);
  const aT=tS.length?Math.round(tS.reduce((a,b)=>a+b.totalDistance,0)/tS.length):"--";
  document.getElementById("pt-shots").textContent=ds.length;
  document.getElementById("pt-carry").innerHTML=aC==="--"?"--":aC+'<span style="font-size:8px;color:#4a7a4a">y</span>';
  document.getElementById("pt-total").innerHTML=aT==="--"?"--":aT+'<span style="font-size:8px;color:#4a7a4a">y</span>';
  pRenderMatrix(filt); pRenderDisp(ds,cs);
  // Club tabs
  let tabs=pTab("all","ALL",pDashClub==="all","#5ba85e");
  cs.forEach(({club})=>tabs+=pTab(club,club,pDashClub===club,clr(club)));
  if(!cs.length)tabs+='<div style="font-size:9px;color:#2a4a2a;padding:7px">No shots yet</div>';
  document.getElementById("p-club-tabs").innerHTML=tabs;
  const det=document.getElementById("p-club-det");
  if(pDashClub!=="all"){
    const st=cs.find(s=>s.club===pDashClub);
    if(st){const col=clr(st.club);det.style.display="block";
      det.innerHTML=`<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
        <div style="font-size:20px;font-weight:700;color:${col}">${st.club}</div>
        <div style="font-size:10px;color:#3a5a3a">${st.count} shots</div></div>
        <div class="g4" style="gap:6px">
          ${[["AVG CARRY",st.avgC+"y",col],["AVG TOTAL",st.avgT?st.avgT+"y":"--","#e8b84b"],
            ["MAX",st.maxC+"y","#e8f5e8"],["OFFLINE",st.avgOff+"y","#6b8cba"]].map(([l,v,c])=>
            `<div style="background:#0d1a0e;border-radius:7px;padding:7px 5px;border:1px solid #1e3a1f;text-align:center">
              <div style="font-size:13px;font-weight:700;color:${c}">${v}</div>
              <div style="font-size:7px;color:#3a5a3a;margin-top:1px">${l}</div></div>`
          ).join("")}</div>`;}
  }else{det.style.display="none";}
  // Bar chart
  const maxV=cs.length?Math.max(...cs.map(s=>pDistF==="total"?s.avgT:s.avgC)):1;
  document.getElementById("p-chart-t").textContent=pDistF==="total"?"AVG TOTAL BY CLUB":pDistF==="carry"?"AVG CARRY BY CLUB":"AVG CARRY (green) / TOTAL (gold) BY CLUB";
  document.getElementById("p-carry-chart").innerHTML=cs.map(({club,avgC,avgT,maxC,minC,count})=>{
    const col=clr(club),act=pDashClub===club,dim=pDashClub!=="all"&&!act;
    const val=pDistF==="total"?avgT:avgC;
    return`<div onclick="pPickDC('${club}')" style="display:grid;grid-template-columns:42px 1fr 64px;align-items:center;gap:7px;cursor:pointer;opacity:${dim?0.35:1};margin-bottom:7px">
      <div style="font-size:10px;font-weight:700;color:${col}">${club}</div>
      <div style="position:relative;height:19px">
        <div style="position:absolute;inset:4px 0;background:#1a2e1b;border-radius:3px"></div>
        <div style="position:absolute;top:4px;left:0;bottom:4px;border-radius:3px;width:${(val/maxV*100).toFixed(1)}%;background:${act?"linear-gradient(90deg,"+col+","+col+"88)":"linear-gradient(90deg,"+col+"66,"+col+"22)"}"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;padding-left:6px"><span style="font-size:8px;color:#3a5a3a">${minC}-${maxC} · ${count}</span></div>
      </div>
      <div style="font-size:11px;font-weight:700;color:${act?col:"#e8f5e8"};text-align:right">
        ${pDistF==="both"?`<span style="color:#5ba85e">${avgC}</span><span style="color:#3a5a3a;font-size:7px">/</span><span style="color:#e8b84b">${avgT||"--"}</span>`:val}
        <span style="font-size:7px;color:#4a7a4a">y</span></div>
    </div>`;
  }).join("")||'<div style="color:#2a4a2a;font-size:11px;text-align:center;padding:14px">No data</div>';
  // Shape
  const sc={};ds.forEach(s=>{sc[s.shotShape]=(sc[s.shotShape]||0)+1;});
  document.getElementById("p-shape-t").textContent="SHOT SHAPE -- "+(pDashClub!=="all"?pDashClub:"ALL");
  document.getElementById("p-shape-stats").innerHTML=Object.entries(sc).sort((a,b)=>b[1]-a[1]).map(([sh,cnt])=>
    `<div style="padding:5px 10px;border-radius:6px;background:#1a2e1b;border:1px solid #2a4a2a;display:flex;align-items:center;gap:6px">
      <span style="font-size:11px;color:#8aab8a;font-weight:700">${sh}</span>
      <span style="font-size:9px;color:#4a7a4a">${cnt}</span>
      <span style="font-size:8px;color:#2a4a2a">(${pct(cnt,ds.length)}%)</span></div>`
  ).join("")||'<div style="color:#2a4a2a;font-size:10px">No data</div>';
  // Direction
  document.getElementById("p-dir-t").textContent="DIRECTION -- "+(pDashClub!=="all"?pDashClub:"ALL");
  document.getElementById("p-dir-stats").innerHTML=["Left","Center","Right"].map(dir=>{
    const cnt=ds.filter(s=>s.offlineDirection===dir).length;
    const col=dir==="Left"?"#6b8cba":dir==="Right"?"#ba6b6b":"#5ba85e";
    return`<div style="text-align:center;padding:9px 5px;background:#1a2e1b;border-radius:7px;border:1px solid ${col}22">
      <div style="font-size:16px;font-weight:700;color:${col}">${pct(cnt,ds.length)}%</div>
      <div style="font-size:8px;color:#3a5a3a">${dir.toUpperCase()}</div>
      <div style="font-size:9px;color:#2a4a2a">${cnt}</div></div>`;
  }).join("");
}
function pPickDC(c){pDashClub=c;pRenderDash();}

function pTab(val,label,active,col){
  return`<button onclick="pPickDC('${val}')"
    style="padding:6px 10px;border:1px solid;border-radius:7px 7px 0 0;margin-bottom:-1px;cursor:pointer;
      font-family:'Courier New',monospace;font-size:9px;font-weight:${active?700:400};
      border-color:${active?col:"#1e3a1f"};border-bottom:${active?"3px solid "+col:"1px solid #1e3a1f"};
      background:${active?col+"18":"transparent"};color:${active?col:"#3a5a3a"}">${label}</button>`;
}

function pRenderMatrix(filt){
  const bO=CLUB_LIST.filter(c=>pBag.includes(c));
  const sU=SWINGS.filter(sw=>filt.some(s=>s.swingType===sw));
  if(!sU.length||!filt.length){document.getElementById("p-matrix").innerHTML='<tr><td style="color:#2a4a2a;font-size:10px;padding:10px">No data yet.</td></tr>';return;}
  document.getElementById("p-mat-t").textContent=pDistF==="carry"?"AVG CARRY BY CLUB & SWING":pDistF==="total"?"AVG TOTAL BY CLUB & SWING":"AVG CARRY / TOTAL BY CLUB & SWING";
  let html="<thead><tr><th class='lc'>Club</th>"+sU.map(s=>`<th>${s}</th>`).join("")+"</tr></thead><tbody>";
  bO.forEach(club=>{
    const cs=filt.filter(s=>s.club===club);if(!cs.length)return;
    const col=clr(club);
    html+=`<tr><td class="ln" style="color:${col}">${club}</td>`;
    sU.forEach(sw=>{
      const ss=cs.filter(s=>s.swingType===sw);
      if(!ss.length){html+=`<td class="em">--</td>`;return;}
      const aC=Math.round(ss.reduce((a,b)=>a+b.carryDistance,0)/ss.length);
      const tS=ss.filter(s=>s.totalDistance>0);
      const aT=tS.length?Math.round(tS.reduce((a,b)=>a+b.totalDistance,0)/tS.length):null;
      let cell=pDistF==="carry"?`${aC}<span style="font-size:7px;color:#4a7a4a">y</span>`
        :pDistF==="total"?aT?`${aT}<span style="font-size:7px;color:#4a7a4a">y</span>`:"--"
        :`<span style="color:#5ba85e">${aC}</span><span style="color:#3a5a3a;font-size:7px">/</span><span style="color:#e8b84b">${aT||"--"}</span>`;
      html+=`<td class="hd">${cell}<div style="font-size:7px;color:#3a5a3a">(${ss.length})</div></td>`;
    });
    html+="</tr>";
  });
  document.getElementById("p-matrix").innerHTML=html+"</tbody>";
}

function pRenderDisp(shots,cs){
  const svg=document.getElementById("p-disp-svg");
  const W=340,H=420,cx=W/2,MT=16,MB=34,cH=H-MT-MB;
  if(!shots.length){svg.innerHTML=`<text x="${cx}" y="${H/2}" text-anchor="middle" fill="#2a4a2a" font-size="10" font-family="monospace">Log shots to see dispersion</text>`;document.getElementById("p-disp-leg").innerHTML="";return;}
  const carries=shots.map(s=>s.carryDistance);
  const mxC=Math.max(...carries),mnC=Math.min(...carries);
  const rT=mxC*1.08,rB=Math.max(0,mnC*0.88);
  const yF=d=>MT+cH-((d-rB)/(rT-rB))*cH;
  const offs=shots.map(s=>s.offlineDirection==="Left"?-s.distanceOffline:s.offlineDirection==="Right"?s.distanceOffline:0);
  const mO=Math.max(10,...offs.map(Math.abs))*1.3;
  const xF=o=>cx+(o/mO)*(cx*0.85);
  const step=mxC>250?50:mxC>150?25:10;
  let arcs="";
  for(let v=Math.ceil(rB/step)*step;v<=rT;v+=step){const y=yF(v);
    arcs+=`<ellipse cx="${cx}" cy="${(y+cH*0.6).toFixed(1)}" rx="${(cx*0.92).toFixed(1)}" ry="${(cH*0.6).toFixed(1)}" fill="none" stroke="#1a2e1b" stroke-width="1"/>
    <text x="${W-4}" y="${(y+4).toFixed(1)}" text-anchor="end" fill="#2a4a2a" font-size="7" font-family="monospace">${v}y</text>`;}
  const byC={};shots.forEach((s,i)=>{(byC[s.club]=byC[s.club]||[]).push({c:s.carryDistance,o:offs[i]});});
  let ell="",dots="";
  Object.entries(byC).forEach(([club,pts])=>{
    const n=pts.length,mc=pts.reduce((a,b)=>a+b.c,0)/n,mo=pts.reduce((a,b)=>a+b.o,0)/n;
    const sc=n>1?Math.sqrt(pts.reduce((a,b)=>a+(b.c-mc)**2,0)/n):8;
    const so=n>1?Math.sqrt(pts.reduce((a,b)=>a+(b.o-mo)**2,0)/n):5;
    const col=clr(club),fad=pDashClub!=="all"&&pDashClub!==club;
    const rx=Math.max(7,(so/mO)*(cx*0.85)*2),ry=Math.max(9,(sc/(rT-rB))*cH*2);
    ell+=`<ellipse cx="${xF(mo).toFixed(1)}" cy="${yF(mc).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${col}18" stroke="${col}" stroke-width="${fad?0.5:1.5}" opacity="${fad?0.2:0.9}"/>`;
  });
  shots.forEach((s,i)=>{
    const col=clr(s.club),fad=pDashClub!=="all"&&pDashClub!==s.club;
    const lb=s.club.replace("°","").slice(0,2);
    dots+=`<circle cx="${xF(offs[i]).toFixed(1)}" cy="${yF(s.carryDistance).toFixed(1)}" r="${fad?3:5}" fill="${col}" opacity="${fad?0.2:0.85}" stroke="#060e06" stroke-width="1"/>
    <text x="${xF(offs[i]).toFixed(1)}" y="${(yF(s.carryDistance)+3.5).toFixed(1)}" text-anchor="middle" font-size="5" font-family="monospace" font-weight="bold" fill="#060e06" opacity="${fad?0:1}">${lb}</text>`;
  });
  svg.innerHTML=arcs+`<line x1="${cx}" y1="${MT}" x2="${cx}" y2="${H-MB}" stroke="#2a4a2a" stroke-width="1" stroke-dasharray="4 4"/>
  <text x="5" y="${H-MB+14}" fill="#2a4a2a" font-size="7" font-family="monospace">&lt; LEFT</text>
  <text x="${W-5}" y="${H-MB+14}" text-anchor="end" fill="#2a4a2a" font-size="7" font-family="monospace">RIGHT &gt;</text>`+ell+dots;
  document.getElementById("p-disp-leg").innerHTML=cs.filter(s=>pDashClub==="all"||s.club===pDashClub).map(({club})=>
    `<div style="display:flex;align-items:center;gap:4px"><div style="width:7px;height:7px;border-radius:50%;background:${clr(club)}"></div><span style="font-size:8px;color:#8aab8a">${club}</span></div>`
  ).join("");
  document.getElementById("p-disp-t").textContent="SHOT DISPERSION -- "+(pDashClub!=="all"?pDashClub:"ALL CLUBS");
}

//                             COURSES                            
let ceEditId=null;

function renderCourses(){
  const list=document.getElementById("course-list");
  const empty=document.getElementById("course-empty");
  if(!courses.length){list.innerHTML="";empty.style.display="block";return;}
  empty.style.display="none";
  list.innerHTML=courses.map(c=>{
    let totPar=0,totDist=0;
    for(let h=1;h<=18;h++){totPar+=Number(c["h"+h+"Par"])||0;totDist+=Number(c["h"+h+"Dist"])||0;}
    return`<div class="card" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="openCE('${c.id}')">
      <div>
        <div style="font-size:13px;font-weight:700;color:#e8f5e8">${c.name}</div>
        <div style="font-size:9px;color:#4a7a4a;margin-top:2px">${c.tee} tees · Rating ${c.courseRating} · Slope ${c.slopeRating}</div>
        <div style="font-size:9px;color:#3a5a3a;margin-top:1px">Par ${totPar} · ${totDist}y total</div>
      </div>
      <div style="color:#4a7a4a;font-size:16px">›</div>
    </div>`;
  }).join("");
}

function openCE(id){
  ceEditId=id; const c=id?courses.find(x=>x.id===id):null;
  document.getElementById("ce-title").textContent=c?"EDIT COURSE":"ADD COURSE";
  document.getElementById("ce-name").value=c?c.name:"";
  document.getElementById("ce-tee").value=c?c.tee:"";
  document.getElementById("ce-tee-custom").value="";
  document.getElementById("ce-rating").value=c?c.courseRating:"";
  document.getElementById("ce-slope").value=c?c.slopeRating:"";
  document.getElementById("ce-del-btn").style.display=c?"inline-block":"none";
  let rows="";
  for(let h=1;h<=18;h++){
    rows+=`<tr>
      <td style="font-weight:700;color:#e8f5e8;padding:4px 6px">${h}</td>
      <td><input class="course-tbl" id="ceh${h}p" type="tel" inputmode="numeric" value="${c?c["h"+h+"Par"]||"":""}" placeholder="4" style="width:36px"/></td>
      <td><input class="course-tbl" id="ceh${h}s" type="tel" inputmode="numeric" value="${c?c["h"+h+"Si"]||"":""}"  placeholder="${h}" style="width:36px"/></td>
      <td><input class="course-tbl" id="ceh${h}d" type="tel" inputmode="numeric" value="${c?c["h"+h+"Dist"]||"":""}" placeholder="350" style="width:52px"/></td>
    </tr>`;
  }
  document.getElementById("ce-holes-body").innerHTML=rows;
  document.getElementById("ce-modal").classList.add("open");
}
function closeCE(){document.getElementById("ce-modal").classList.remove("open");ceEditId=null;}
async function saveCourse(){
  const name=document.getElementById("ce-name").value.trim();
  const tee=(document.getElementById("ce-tee-custom").value||document.getElementById("ce-tee").value).trim();
  if(!name||!tee){banner("Course name and tee are required",true);return;}
  const c={id:ceEditId||uid(),name,tee,
    courseRating:parseFloat(document.getElementById("ce-rating").value)||72,
    slopeRating:parseFloat(document.getElementById("ce-slope").value)||113};
  for(let h=1;h<=18;h++){
    c["h"+h+"Par"] =parseInt(document.getElementById("ceh"+h+"p").value)||0;
    c["h"+h+"Si"]  =parseInt(document.getElementById("ceh"+h+"s").value)||0;
    c["h"+h+"Dist"]=parseInt(document.getElementById("ceh"+h+"d").value)||0;
  }
  const idx=courses.findIndex(x=>x.id===c.id);
  if(idx>=0)courses[idx]=c; else courses.push(c);
  gs("courses",courses); closeCE(); renderCourses(); banner("Course saved");
  try{await api(ROUND_URL,"saveCourse",{data:c});}catch(e){banner("Saved locally -- sheet sync failed",true);}
}
async function deleteCourse(){
  if(!ceEditId||!confirm("Delete this course?"))return;
  courses=courses.filter(c=>c.id!==ceEditId); gs("courses",courses);
  closeCE(); renderCourses();
  try{await api(ROUND_URL,"deleteCourse",{id:ceEditId});}catch(e){}
}

//                             ROUND TRACKER                            
function rInit(){
  rShowView(curRound?"holes":"setup");
  const sel=document.getElementById("r-course-sel");
  sel.innerHTML='<option value="">Select a course...</option>';
  courses.forEach(c=>sel.innerHTML+=`<option value="${c.id}">${c.name} (${c.tee})</option>`);
  if(curRound)rUpdateSummary();
}
function rShowView(v){
  rCurView=v;
  ["setup","holes","card","rounds"].forEach(x=>{
    document.getElementById("rv-"+x).style.display=x===v?"block":"none";
    const nb=document.getElementById("rnav-"+x);if(nb)nb.classList.toggle("active",x===v);
  });
  if(v==="holes") rRenderHoles();
  if(v==="card")  rRenderCard();
  if(v==="rounds") rRenderAllRounds();
}
function rBack(){
  if(curRound&&!confirm("Leave this round? Progress is saved."))return;
  goTo("home");
}
function rCourseChanged(){
  const id=document.getElementById("r-course-sel").value;
  const course=courses.find(c=>c.id===id);
  const el=document.getElementById("r-tee-btns");
  if(!course){el.innerHTML="";return;}
  el.innerHTML=`<button class="pill" onclick="rSetTee('${course.tee}')"
    style="border-color:#5ba85e;background:#5ba85e22;color:#5ba85e;font-weight:700">${course.tee}</button>`;
  rSelTee=course.tee;
}
function rSetTee(t){rSelTee=t;}
function rSetCond(c){
  rCondition=c;
  ["Sunny","Overcast","Rain","Wind","Cold"].forEach(x=>
    document.getElementById("rcond-"+x).classList.toggle("active",x===c));
}

function rStart(){
  const courseId=document.getElementById("r-course-sel").value;
  const course=courses.find(c=>c.id===courseId);
  if(!course){banner("Please select a course first",true);return;}
  const hcp=parseFloat(document.getElementById("r-hcp").value)||0;
  curRound={id:uid(),date:new Date().toISOString(),
    courseId:course.id,courseName:course.name,tee:rSelTee||course.tee,
    handicap:hcp,courseRating:course.courseRating,slopeRating:course.slopeRating,
    conditions:rCondition,roundType:document.getElementById("r-type").value,
    totalStrokes:0,totalPutts:0,fairwaysHit:0,fairwaysTotal:0,
    girCount:0,girTotal:0,pcc:0,scoreDifferential:0,notes:""};
  for(let h=1;h<=18;h++){
    const par=course["h"+h+"Par"]||0;if(!par)continue;
    rHoles.push({id:uid(),roundId:curRound.id,holeNumber:h,
      par,strokeIndex:course["h"+h+"Si"]||h,distance:course["h"+h+"Dist"]||0,
      strokes:0,putts:0,gir:false,fairwayHit:null,fairwayPosition:"",
      penalties:0,stablefordPoints:0,notes:""});
  }
  rounds.push(curRound); gs("rounds",rounds); gs("r-holes",rHoles);
  document.getElementById("rh-title").textContent=course.name;
  document.getElementById("rh-sub").textContent=rSelTee+" tees · Hcp "+hcp;
  rShowView("holes");
  api(ROUND_URL,"saveRound",{data:curRound}).catch(()=>{});
  rHoles.filter(h=>h.roundId===curRound.id).forEach(h=>api(ROUND_URL,"saveHole",{data:h}).catch(()=>{}));
}

function rRenderHoles(){
  const myH=rHoles.filter(h=>h.roundId===curRound?.id).sort((a,b)=>a.holeNumber-b.holeNumber);
  document.getElementById("r-hole-list").innerHTML=myH.map(h=>{
    const shots=rShots.filter(s=>s.holeId===h.id);
    const done=h.strokes>0;
    const diff=h.strokes-h.par;
    const bc=diff<=-2?"be":diff===-1?"bb":diff===0?"bp":diff===1?"bg":diff===2?"bd":"bw";
    return`<div class="hole-card ${done?"done":""}" onclick="openSL(${h.holeNumber})">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="score-badge ${done?bc:""}">${done?h.strokes:"H"+h.holeNumber}</div>
          <div>
            <div style="font-size:12px;font-weight:700;color:#e8f5e8">Hole ${h.holeNumber}</div>
            <div style="font-size:9px;color:#4a7a4a">Par ${h.par} · SI ${h.strokeIndex} · ${h.distance}y</div>
          </div>
        </div>
        <div style="text-align:right">
          ${done?`<div style="font-size:11px;color:${diff<=0?"#5ba85e":diff===1?"#8aab8a":"#ba6b6b"};font-weight:700">${diff===0?"E":diff>0?"+"+diff:diff}</div>`:""}
          <div style="font-size:8px;color:#3a5a3a">${shots.length} shots · ${h.putts} putts</div>
          ${h.gir?'<div style="font-size:8px;color:#4fc3f7">GIR ✓</div>':""}
        </div>
      </div></div>`;
  }).join("")||'<div style="text-align:center;padding:40px;color:#2a4a2a;font-size:11px">Start a round to see holes here.</div>';
  rUpdateSummary();
}

function rUpdateSummary(){
  if(!curRound)return;
  const myH=rHoles.filter(h=>h.roundId===curRound.id&&h.strokes>0);
  const totS=myH.reduce((a,b)=>a+b.strokes,0);
  const totP=myH.reduce((a,b)=>a+b.putts,0);
  const totPar=myH.reduce((a,b)=>a+b.par,0);
  const girN=myH.filter(h=>h.gir).length;
  const fwH=myH.filter(h=>h.par>3);
  const fwN=fwH.filter(h=>h.fairwayHit).length;
  const stbl=myH.reduce((a,b)=>a+b.stablefordPoints,0);
  document.getElementById("rs-score").textContent=totS||"--";
  const vp=totS-totPar;
  document.getElementById("rs-par").textContent=totS?vp===0?"E":vp>0?"+"+vp:vp:"--";
  document.getElementById("rs-gir").textContent=myH.length?girN+"/"+myH.length:"--";
  document.getElementById("rs-putts").textContent=totP||"--";
  document.getElementById("rs-fir").textContent=fwH.length?fwN+"/"+fwH.length:"--";
  document.getElementById("rs-stbl").textContent=stbl||"--";
}

function rFinish(){
  if(!curRound||!confirm("Mark round as complete?"))return;
  const myH=rHoles.filter(h=>h.roundId===curRound.id&&h.strokes>0);
  const totS=myH.reduce((a,b)=>a+b.strokes,0);
  const diff=((113/curRound.slopeRating)*(totS-curRound.courseRating-curRound.pcc)).toFixed(1);
  curRound.totalStrokes=totS; curRound.scoreDifferential=parseFloat(diff);
  const idx=rounds.findIndex(r=>r.id===curRound.id);
  if(idx>=0)rounds[idx]=curRound; gs("rounds",rounds);
  api(ROUND_URL,"saveRound",{data:curRound}).catch(()=>{});
  banner("Round saved! Differential: "+diff);
  curRound=null; goTo("home");
}

function rRenderCard(){
  if(!curRound){document.getElementById("r-scorecard").innerHTML="<tr><td style='color:#2a4a2a;padding:14px;font-size:11px'>No active round.</td></tr>";return;}
  const myH=rHoles.filter(h=>h.roundId===curRound.id).sort((a,b)=>a.holeNumber-b.holeNumber);
  const half=(holes,label)=>{
    const tP=holes.reduce((a,b)=>a+b.par,0);
    const tS=holes.reduce((a,b)=>a+b.strokes,0);
    const tSt=holes.reduce((a,b)=>a+b.stablefordPoints,0);
    return`<tr><th>Hole</th>${holes.map(h=>`<th>${h.holeNumber}</th>`).join("")}<th>${label}</th></tr>
    <tr><td style="color:#4a7a4a">Par</td>${holes.map(h=>`<td style="color:#4a7a4a">${h.par}</td>`).join("")}<td>${tP}</td></tr>
    <tr><td style="color:#4a7a4a">SI</td>${holes.map(h=>`<td style="color:#4a7a4a">${h.strokeIndex}</td>`).join("")}<td></td></tr>
    <tr><td>Score</td>${holes.map(h=>{const d=h.strokes-h.par;const c=d<0?"#4fc3f7":d===0?"#5ba85e":d===1?"#8aab8a":"#ba6b6b";
      return`<td style="color:${c};font-weight:${d!==0?700:400}">${h.strokes||""}</td>`;}).join("")}
    <td style="font-weight:700;color:#e8f5e8">${tS||""}</td></tr>
    <tr><td style="color:#4a7a4a">Pts</td>${holes.map(h=>`<td style="color:#80cbc4">${h.stablefordPoints||""}</td>`).join("")}
    <td style="color:#80cbc4;font-weight:700">${tSt||""}</td></tr>`;
  };
  document.getElementById("r-scorecard").innerHTML=`<thead>${half(myH.slice(0,9),"OUT")}</thead><tbody>${half(myH.slice(9),"IN")}</tbody>`;
  const tS=myH.reduce((a,b)=>a+b.strokes,0);
  const tP=myH.reduce((a,b)=>a+b.par,0);
  document.getElementById("rc-tot").textContent=tS||"--";
  const vp=tS-tP;document.getElementById("rc-par").textContent=tS?vp===0?"E":vp>0?"+"+vp:vp:"--";
  document.getElementById("rc-stbl").textContent=myH.reduce((a,b)=>a+b.stablefordPoints,0)||"--";
}

function rRenderAllRounds(){
  if(!rounds.length){document.getElementById("r-rounds-list").innerHTML='<div style="text-align:center;padding:40px;color:#2a4a2a;font-size:11px">No rounds played yet.</div>';return;}
  document.getElementById("r-rounds-list").innerHTML=[...rounds].reverse().map(r=>{
    const diff=parseFloat(r.scoreDifferential);
    return`<div class="card" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="loadRound('${r.id}')">
      <div>
        <div style="font-size:12px;font-weight:700;color:#e8f5e8">${r.courseName}</div>
        <div style="font-size:9px;color:#4a7a4a">${fmtD(r.date)} · ${r.tee} · Hcp ${r.handicap}</div>
        <div style="font-size:9px;color:#3a5a3a;margin-top:1px">${r.totalStrokes?r.totalStrokes+" strokes":""} ${!isNaN(diff)&&diff?"· Diff "+diff.toFixed(1)":""}</div>
      </div><div style="color:#4a7a4a;font-size:14px">›</div>
    </div>`;
  }).join("");
}
function loadRound(id){
  curRound=rounds.find(r=>r.id===id);
  if(!curRound)return;
  document.getElementById("rh-title").textContent=curRound.courseName;
  document.getElementById("rh-sub").textContent=curRound.tee+" · "+fmtD(curRound.date);
  rShowView("holes");
}

//                             SHOT LOGGER                            
function openSL(holeNo){
  if(!curRound)return;
  curHoleNo=holeNo;
  slHole=rHoles.find(h=>h.roundId===curRound.id&&h.holeNumber===holeNo);
  if(!slHole)return;
  slHoleShots=rShots.filter(s=>s.holeId===slHole.id).sort((a,b)=>a.shotNumber-b.shotNumber);
  slSelType="Tee"; slClub=pBag[0]||"Driver"; slSwing="Full"; slShape="Straight";
  slLZ=""; slLie=""; slHitGreen=null; slMissDir=""; slPSlope=""; slPBreak=""; slPResult=""; slPMissSide="";
  document.getElementById("sl-title").textContent="Hole "+holeNo+" -- "+slHole.par===3?"Par 3":"Par "+slHole.par;
  document.getElementById("sl-sub").textContent="Par "+slHole.par+" · SI "+slHole.strokeIndex+" · "+slHole.distance+"y";
  renderSLTypes(); renderSLList(); renderSLFields();
  document.getElementById("sl-modal").classList.add("open");
}
function closeSL(){document.getElementById("sl-modal").classList.remove("open");rRenderHoles();}

function renderSLTypes(){
  const types=slHole?.par===3?["Tee","Chip","Pitch","Bunker","Putt"]:["Tee","Lay-up","Approach","Chip","Pitch","Bunker","Putt"];
  document.getElementById("sl-type-btns").innerHTML=types.map(t=>
    `<button class="tog${t===slSelType?" active":""}" onclick="slSetType('${t}')">${t}</button>`
  ).join("");
}
function slSetType(t){slSelType=t;renderSLTypes();renderSLFields();}

function renderSLList(){
  const cnt=slHoleShots.length;
  document.getElementById("sl-shot-count").textContent=slHole.strokes||cnt;
  document.getElementById("sl-putt-count").textContent=slHole.putts||0;
  if(!cnt){document.getElementById("sl-shot-list").innerHTML='<div style="font-size:10px;color:#2a4a2a;margin-bottom:8px">No shots logged yet for this hole.</div>';return;}
  document.getElementById("sl-shot-list").innerHTML=slHoleShots.map((s,i)=>`
    <div class="shot-row">
      <div class="shot-num">${s.shotNumber||i+1}</div>
      <div style="flex:1">
        <div style="font-size:10px;color:#e8f5e8;font-weight:700">${s.shotType}${s.club?' <span style="color:'+clr(s.club)+'">'+s.club+"</span>":""}</div>
        <div style="font-size:9px;color:#4a7a4a">
          ${s.distanceToPin?s.distanceToPin+"y to pin · ":""}${s.puttDistance?s.puttDistance+"ft · ":""}
          ${s.carryDistance?s.carryDistance+"y carry · ":""}${s.landingZone||s.puttResult||""}
        </div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="slDelShot('${s.id}')">✕</button>
    </div>`).join("");
}

function renderSLFields(){
  const t=slSelType;
  const showCaddy=["Tee","Lay-up","Approach","Pitch","Chip","Bunker"].includes(t);
  document.getElementById("sl-caddy").style.display=showCaddy?"block":"none";
  const tgt=document.getElementById("sl-target");
  if(tgt&&tgt.value)renderCaddy();

  if(t==="Putt"){
    document.getElementById("sl-fields").innerHTML=`
    <div class="card-dark" style="margin-bottom:8px">
      <div class="g2" style="gap:10px;margin-bottom:8px">
        <div><div class="slabel">Distance to Pin (ft)</div>
          <input id="slf-pdist" class="field-input" type="tel" inputmode="decimal" placeholder="e.g. 20"
            oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
        <div><div class="slabel">Slope</div>
          <div style="display:flex;flex-direction:column;gap:3px">
            ${PUTT_SLOPES.map(s=>`<button class="tog" id="slps-${s}" onclick="slSetPS('${s}')">${s}</button>`).join("")}
          </div></div>
      </div>
      <div style="margin-bottom:8px"><div class="slabel">Break</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${PUTT_BREAKS.map(s=>`<button class="tog" id="slpb-${s.replace(/ /g,"_")}" onclick="slSetPB('${s}')">${s}</button>`).join("")}
        </div></div>
      <div><div class="slabel">Result</div>
        <div style="display:flex;gap:5px">
          <button class="tog" id="slpr-Holed"  onclick="slSetPR('Holed')">✓ Holed</button>
          <button class="tog" id="slpr-Missed" onclick="slSetPR('Missed')">✗ Missed</button>
        </div></div>
      <div id="slf-pmiss" style="display:none;margin-top:8px">
        <div class="slabel">Missed -- direction</div>
        <div class="compass">${["Long Left","Long","Long Right","Left","","Right","Short Left","Short","Short Right"].map(d=>
          d?`<button class="cbtn" onclick="slSetMD('${d}')" id="slmd-${d.replace(/ /g,"_")}">${d}</button>`:"<div></div>"
        ).join("")}</div>
        <div style="display:flex;gap:5px;margin-top:6px">
          <button class="tog" id="slms-Low"  onclick="slSetMS('Low')">Low Side</button>
          <button class="tog" id="slms-High" onclick="slSetMS('High')">High Side</button>
        </div>
        <div style="margin-top:6px"><div class="slabel">Miss Distance (ft)</div>
          <input id="slf-mdist" class="field-input" type="tel" inputmode="decimal" placeholder="e.g. 2"
            oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
      </div></div>`;
  } else if(["Tee","Lay-up"].includes(t)){
    document.getElementById("sl-fields").innerHTML=`
    <div class="card-dark" style="margin-bottom:8px">
      <div class="g2" style="gap:10px;margin-bottom:8px">
        <div><div class="slabel">Club</div><div id="slf-clubs" style="display:flex;flex-wrap:wrap;gap:4px"></div></div>
        <div><div class="slabel">Swing</div><div id="slf-swings" style="display:flex;flex-direction:column;gap:3px"></div></div>
      </div>
      <div class="g2" style="gap:10px;margin-bottom:8px">
        <div><div class="slabel">Carry (yds)</div>
          <input id="slf-carry" class="field-input" type="tel" inputmode="decimal" placeholder="0"
            oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
        <div><div class="slabel">Total (yds)</div>
          <input id="slf-total" class="field-input" type="tel" inputmode="decimal" placeholder="0"
            oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
      </div>
      <div style="margin-bottom:8px"><div class="slabel">Shot Shape</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px" id="slf-shapes"></div></div>
      <div><div class="slabel">Landing Zone</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${LAND_ZONES.map(z=>`<button class="tog" id="sllz-${z.replace(/ /g,"_")}" onclick="slSetLZ('${z}')">${z}</button>`).join("")}
        </div></div></div>`;
    slPopClubs(); slPopSwings(); slPopShapes();
  } else {
    document.getElementById("sl-fields").innerHTML=`
    <div class="card-dark" style="margin-bottom:8px">
      <div class="g2" style="gap:10px;margin-bottom:8px">
        <div><div class="slabel">Club</div><div id="slf-clubs" style="display:flex;flex-wrap:wrap;gap:4px"></div></div>
        <div><div class="slabel">Swing</div><div id="slf-swings" style="display:flex;flex-direction:column;gap:3px"></div></div>
      </div>
      <div class="g2" style="gap:10px;margin-bottom:8px">
        <div><div class="slabel">Dist to Pin (yds)</div>
          <input id="slf-topin" class="field-input" type="tel" inputmode="decimal" placeholder="e.g. 150"
            oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
        <div><div class="slabel">Carry (yds)</div>
          <input id="slf-carry" class="field-input" type="tel" inputmode="decimal" placeholder="0"
            oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
      </div>
      <div style="margin-bottom:8px"><div class="slabel">Lie</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${LIE_TYPES.map(l=>`<button class="tog" id="sllie-${l.replace(/ /g,"_")}" onclick="slSetLie('${l}')">${l}</button>`).join("")}
        </div></div>
      <div style="margin-bottom:8px"><div class="slabel">Shot Shape</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px" id="slf-shapes"></div></div>
      <div style="margin-bottom:8px"><div class="slabel">Result</div>
        <div style="display:flex;gap:5px">
          <button class="tog" id="slhg-yes" onclick="slSetHG(true)">Hit Green ✓</button>
          <button class="tog" id="slhg-no"  onclick="slSetHG(false)">Missed ✗</button>
        </div></div>
      <div id="slf-amiss" style="display:none">
        <div class="slabel">Miss Direction</div>
        <div class="compass">${["Long Left","Long","Long Right","Left","","Right","Short Left","Short","Short Right"].map(d=>
          d?`<button class="cbtn" onclick="slSetMD('${d}')" id="slmd-${d.replace(/ /g,"_")}">${d}</button>`:"<div></div>"
        ).join("")}</div>
        <div style="margin-top:6px"><div class="slabel">Miss Distance (yds)</div>
          <input id="slf-mdist" class="field-input" type="tel" inputmode="decimal" placeholder="e.g. 15"
            oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
      </div></div>`;
    slPopClubs(); slPopSwings(); slPopShapes();
  }
}

function slPopClubs(){
  const el=document.getElementById("slf-clubs");if(!el)return;
  el.innerHTML=CLUB_LIST.filter(c=>pBag.includes(c)).map(c=>{
    const col=clr(c),a=c===slClub;
    return`<button class="pill" onclick="slPC('${c}')" id="slc-${c.replace(/[°]/g,"d")}"
      style="font-size:9px;padding:4px 8px;border-color:${a?col:"#1e3a1f"};background:${a?col+"22":"transparent"};color:${a?col:"#3a5a3a"};font-weight:${a?700:400}">${c}</button>`;
  }).join("");
}
function slPC(c){slClub=c;slPopClubs();renderCaddy();}

function slPopSwings(){
  const el=document.getElementById("slf-swings");if(!el)return;
  el.innerHTML=SWINGS.map(s=>
    `<button class="tog${s===slSwing?" active":""}" onclick="slPS('${s}')" style="font-size:10px;padding:4px 8px">${s}</button>`
  ).join("");
}
function slPS(s){slSwing=s;slPopSwings();renderCaddy();}

function slPopShapes(){
  const el=document.getElementById("slf-shapes");if(!el)return;
  el.innerHTML=SHAPES.map(s=>
    `<button class="tog${s===slShape?" active":""}" onclick="slPSh('${s}')" style="font-size:10px;padding:4px 7px">${s}</button>`
  ).join("");
}
function slPSh(s){slShape=s;slPopShapes();}
function slSetLZ(z){slLZ=z;document.querySelectorAll("[id^='sllz-']").forEach(b=>b.classList.remove("active"));const el=document.getElementById("sllz-"+z.replace(/ /g,"_"));if(el)el.classList.add("active");}
function slSetLie(l){slLie=l;document.querySelectorAll("[id^='sllie-']").forEach(b=>b.classList.remove("active"));const el=document.getElementById("sllie-"+l.replace(/ /g,"_"));if(el)el.classList.add("active");}
function slSetHG(v){
  slHitGreen=v;
  document.getElementById("slhg-yes").classList.toggle("active",v===true);
  document.getElementById("slhg-no").classList.toggle("active",v===false);
  const m=document.getElementById("slf-amiss");if(m)m.style.display=v===false?"block":"none";
}
function slSetMD(d){slMissDir=d;document.querySelectorAll("[id^='slmd-']").forEach(b=>b.classList.remove("active"));const el=document.getElementById("slmd-"+d.replace(/ /g,"_"));if(el)el.classList.add("active");}
function slSetPS(s){slPSlope=s;PUTT_SLOPES.forEach(x=>{const el=document.getElementById("slps-"+x);if(el)el.classList.toggle("active",x===s);});}
function slSetPB(b){slPBreak=b;PUTT_BREAKS.forEach(x=>{const el=document.getElementById("slpb-"+x.replace(/ /g,"_"));if(el)el.classList.toggle("active",x===b);});}
function slSetPR(r){
  slPResult=r;
  document.getElementById("slpr-Holed").classList.toggle("active",r==="Holed");
  document.getElementById("slpr-Missed").classList.toggle("active",r==="Missed");
  const m=document.getElementById("slf-pmiss");if(m)m.style.display=r==="Missed"?"block":"none";
}
function slSetMS(s){slPMissSide=s;document.getElementById("slms-Low").classList.toggle("active",s==="Low");document.getElementById("slms-High").classList.toggle("active",s==="High");}

//    Caddy                                                       
function renderCaddy(){
  const tEl=document.getElementById("sl-target");
  const out=document.getElementById("sl-caddy-out");
  if(!tEl||!out)return;
  const target=parseFloat(tEl.value);
  if(!target||isNaN(target)||!pShots.length){
    out.innerHTML='<div style="font-size:9px;color:#2a4a2a">Enter a target distance for suggestions.</div>';return;
  }
  const combos=[];
  CLUB_LIST.filter(c=>pBag.includes(c)).forEach(club=>{
    SWINGS.forEach(swing=>{
      const ss=pShots.filter(s=>s.club===club&&s.swingType===swing&&s.carryDistance>0);
      if(ss.length<2)return;
      const aC=Math.round(ss.reduce((a,b)=>a+b.carryDistance,0)/ss.length);
      const tS=ss.filter(s=>s.totalDistance>0);
      const aT=tS.length?Math.round(tS.reduce((a,b)=>a+b.totalDistance,0)/tS.length):null;
      combos.push({club,swing,avgC:aC,avgT:aT,diff:aC-target,n:ss.length});
    });
  });
  if(!combos.length){out.innerHTML='<div style="font-size:9px;color:#2a4a2a">Not enough practice data yet.</div>';return;}
  combos.sort((a,b)=>Math.abs(a.diff)-Math.abs(b.diff));
  const top=combos.slice(0,5);
  out.innerHTML=`<table class="caddy-table">
    <thead><tr><th>Club</th><th>Swing</th><th>Carry</th><th>Total</th><th>Diff</th><th>n</th></tr></thead>
    <tbody>${top.map((c,i)=>`<tr class="${i===0?"best":""}" onclick="slPC('${c.club}');slPS('${c.swing}')">
      <td class="cp" style="color:${clr(c.club)}">${c.club}</td>
      <td>${c.swing}</td><td>${c.avgC}y</td><td>${c.avgT?c.avgT+"y":"--"}</td>
      <td class="${c.diff>0?"cp":"cn"}">${c.diff>0?"+"+c.diff:c.diff}y</td>
      <td style="color:#3a5a3a">${c.n}</td>
    </tr>`).join("")}</tbody></table>
  <div style="font-size:8px;color:#3a5a3a;margin-top:4px">★ Best: ${top[0].club} ${top[0].swing} · Tap row to select</div>`;
}

//    Add shot                                                       
async function addShot(){
  if(!slHole||!curRound)return;
  const t=slSelType;
  const shot={
    id:uid(), roundId:curRound.id, holeId:slHole.id, holeNumber:slHole.holeNumber,
    shotNumber:slHoleShots.length+1, shotType:t,
    club:slClub, swingType:slSwing, shotShape:slShape,
    targetDistance:parseFloat(document.getElementById("sl-target")?.value)||0,
    carryDistance:parseFloat(document.getElementById("slf-carry")?.value)||0,
    totalDistance:parseFloat(document.getElementById("slf-total")?.value)||0,
    distanceToPin:parseFloat(document.getElementById("slf-topin")?.value)||0,
    landingZone:slLZ, lieType:slLie,
    hitGreen:slHitGreen,
    greenMissDirection:slMissDir,
    greenMissDistance:parseFloat(document.getElementById("slf-mdist")?.value)||0,
    puttDistance:parseFloat(document.getElementById("slf-pdist")?.value)||0,
    puttSlope:slPSlope, puttBreak:slPBreak, puttResult:slPResult,
    puttMissDirection:slMissDir, puttMissSide:slPMissSide,
    missDistance:parseFloat(document.getElementById("slf-mdist")?.value)||0,
  };
  rShots.push(shot); slHoleShots.push(shot);
  // Update hole
  slHole.strokes=slHoleShots.length;
  slHole.putts=slHoleShots.filter(s=>s.shotType==="Putt").length;
  // GIR
  const appr=slHoleShots.filter(s=>["Approach","Tee"].includes(s.shotType)&&s.hitGreen!==null);
  slHole.gir=appr.length>0&&appr[appr.length-1].hitGreen===true&&slHole.strokes<=(slHole.par-2+slHole.putts);
  // Fairway
  if(t==="Tee"&&slHole.par>3){slHole.fairwayHit=slLZ==="Fairway";slHole.fairwayPosition=slLZ;}
  // Stableford
  const hcpStrokes=Math.floor(curRound.handicap/18)+(slHole.strokeIndex<=(curRound.handicap%18)?1:0);
  slHole.stablefordPoints=Math.max(0,2-(slHole.strokes-hcpStrokes-slHole.par));
  gs("r-shots",rShots); gs("r-holes",rHoles);
  renderSLList(); renderSLFields();
  document.getElementById("sl-title").textContent="Hole "+curHoleNo+" -- "+slHole.strokes+" shot"+(slHole.strokes!==1?"s":"");
  api(ROUND_URL,"saveShot",{data:shot}).catch(()=>{});
  api(ROUND_URL,"saveHole",{data:slHole}).catch(()=>{});
}

async function addPenalty(){
  if(!slHole||!curRound)return;
  const shot={id:uid(),roundId:curRound.id,holeId:slHole.id,holeNumber:slHole.holeNumber,
    shotNumber:slHoleShots.length+1,shotType:"Penalty"};
  rShots.push(shot); slHoleShots.push(shot);
  slHole.strokes=slHoleShots.length;
  const hcpStrokes=Math.floor(curRound.handicap/18)+(slHole.strokeIndex<=(curRound.handicap%18)?1:0);
  slHole.stablefordPoints=Math.max(0,2-(slHole.strokes-hcpStrokes-slHole.par));
  gs("r-shots",rShots); gs("r-holes",rHoles);
  renderSLList();
  document.getElementById("sl-title").textContent="Hole "+curHoleNo+" -- "+slHole.strokes+" shot"+(slHole.strokes!==1?"s":"");
  api(ROUND_URL,"saveShot",{data:shot}).catch(()=>{});
  api(ROUND_URL,"saveHole",{data:slHole}).catch(()=>{});
}

async function slDelShot(id){
  rShots=rShots.filter(s=>s.id!==id);
  slHoleShots=slHoleShots.filter(s=>s.id!==id);
  slHoleShots.forEach((s,i)=>s.shotNumber=i+1);
  slHole.strokes=slHoleShots.filter(s=>s.shotType!=="Penalty"||true).length;
  slHole.putts=slHoleShots.filter(s=>s.shotType==="Putt").length;
  gs("r-shots",rShots); gs("r-holes",rHoles);
  renderSLList();
  api(ROUND_URL,"deleteShot",{id}).catch(()=>{});
  api(ROUND_URL,"saveHole",{data:slHole}).catch(()=>{});
}

function nextHole(){closeSL();if(curHoleNo<18)openSL(curHoleNo+1);}
function prevHole(){closeSL();if(curHoleNo>1)openSL(curHoleNo-1);}

//                             DASHBOARD                            
function dInit(){dView(dCurView);dRender();}
function dView(v){
  dCurView=v;
  ["stats","handicap"].forEach(x=>{
    document.getElementById("dv-"+x).style.display=x===v?"block":"none";
    const nb=document.getElementById("dnav-"+x);if(nb)nb.classList.toggle("active",x===v);
  });
  dRender();
}
function dSetR(f){
  dRoundsF=f;
  ["all","5","10","20"].forEach(x=>{const el=document.getElementById("drf-"+x);if(el)el.classList.toggle("active",x===f);});
  dRender();
}
function dGetRounds(){
  const s=[...rounds].sort((a,b)=>new Date(b.date)-new Date(a.date));
  return dRoundsF==="all"?s:s.slice(0,parseInt(dRoundsF));
}
function dRender(){if(dCurView==="stats")dRenderStats();else dRenderHcp();}

function dRenderStats(){
  const rs=dGetRounds();
  if(!rs.length){["ds-score","ds-gir","ds-fir","ds-putts","ds-scram","ds-stbl"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="--";});return;}
  const myH=rHoles.filter(h=>rs.some(r=>r.id===h.roundId)&&h.strokes>0);
  const rWithS=rs.filter(r=>r.totalStrokes>0);
  const avgS=rWithS.length?(rWithS.reduce((a,b)=>a+b.totalStrokes,0)/rWithS.length).toFixed(1):"--";
  const girPct=myH.length?pct(myH.filter(h=>h.gir).length,myH.length):0;
  const fwH=myH.filter(h=>h.par>3);
  const firPct=fwH.length?pct(fwH.filter(h=>h.fairwayHit).length,fwH.length):0;
  const avgP=myH.length?(myH.reduce((a,b)=>a+b.putts,0)/myH.length).toFixed(1):0;
  const missG=myH.filter(h=>!h.gir&&h.par>0);
  const scrPct=missG.length?pct(missG.filter(h=>h.strokes<=h.par).length,missG.length):0;
  const avgStbl=rHoles.filter(h=>rs.some(r=>r.id===h.roundId)&&h.strokes>0).length?
    (rHoles.filter(h=>rs.some(r=>r.id===h.roundId)&&h.strokes>0).reduce((a,b)=>a+b.stablefordPoints,0)/
    Math.max(1,rWithS.length)).toFixed(1):"--";
  document.getElementById("ds-score").textContent=avgS;
  document.getElementById("ds-gir").textContent=girPct+"%";
  document.getElementById("ds-fir").textContent=firPct+"%";
  document.getElementById("ds-putts").textContent=avgP;
  document.getElementById("ds-scram").textContent=scrPct+"%";
  document.getElementById("ds-stbl").textContent=avgStbl;
  // Scoring breakdown
  const sc={eagle:0,birdie:0,par:0,bogey:0,double:0,worse:0};
  myH.forEach(h=>{const d=h.strokes-h.par;if(d<=-2)sc.eagle++;else if(d===-1)sc.birdie++;else if(d===0)sc.par++;else if(d===1)sc.bogey++;else if(d===2)sc.double++;else sc.worse++;});
  const tot=myH.length||1;
  document.getElementById("ds-scoring").innerHTML=[["Eagle/Better","#e8b84b",sc.eagle],["Birdie","#4fc3f7",sc.birdie],["Par","#5ba85e",sc.par],["Bogey","#8aab8a",sc.bogey],["Double","#ba6b6b",sc.double],["Worse","#6b2222",sc.worse]].filter(([,, n])=>n>0).map(([l,c,n])=>
    `<div style="padding:6px 10px;border-radius:7px;background:#1a2e1b;border:1px solid ${c}33;text-align:center">
      <div style="font-size:13px;font-weight:700;color:${c}">${n}</div>
      <div style="font-size:8px;color:#3a5a3a">${l}</div>
      <div style="font-size:8px;color:#2a4a2a">${pct(n,tot)}%</div></div>`
  ).join("");
  // GIR by range
  const aShots=rShots.filter(s=>["Approach","Tee"].includes(s.shotType)&&s.distanceToPin>0&&rs.some(r=>r.id===s.roundId));
  document.getElementById("ds-gir-range").innerHTML=[[0,50,"0-50y"],[50,80,"50-80y"],[80,100,"80-100y"],[100,120,"100-120y"],[120,140,"120-140y"],[140,160,"140-160y"],[160,200,"160-200y"],[200,999,"200y+"]].map(([mn,mx,lbl])=>{
    const inR=aShots.filter(s=>Number(s.distanceToPin)>=mn&&Number(s.distanceToPin)<mx);
    const hit=inR.filter(s=>s.hitGreen===true||s.hitGreen==="true");
    if(!inR.length)return"";
    const p=pct(hit.length,inR.length);
    return`<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
      <div style="font-size:9px;color:#4a7a4a;width:58px">${lbl}</div>
      <div style="flex:1;height:14px;background:#1a2e1b;border-radius:3px;position:relative">
        <div style="position:absolute;inset:0;width:${p}%;background:${p>=60?"#5ba85e":p>=30?"#e8b84b":"#ba6b6b"};border-radius:3px"></div>
      </div>
      <div style="font-size:10px;font-weight:700;color:#e8f5e8;width:36px;text-align:right">${p}%</div>
      <div style="font-size:8px;color:#3a5a3a;width:26px">(${inR.length})</div>
    </div>`;
  }).join("")||'<div style="font-size:10px;color:#2a4a2a">No approach shot data yet.</div>';
  // Score by par
  document.getElementById("ds-par").innerHTML=[3,4,5].map(par=>{
    const holes=myH.filter(h=>h.par===par);if(!holes.length)return"";
    const a=(holes.reduce((s,h)=>s+h.strokes,0)/holes.length).toFixed(2);
    const d=(parseFloat(a)-par).toFixed(2);
    return`<div style="display:flex;justify-content:space-between;align-items:center;
      margin-bottom:7px;padding:8px 10px;background:#1a2e1b;border-radius:7px">
      <div style="font-size:12px;color:#e8f5e8;font-weight:700">Par ${par}</div>
      <div style="font-size:9px;color:#8aab8a">${holes.length} holes</div>
      <div style="font-size:13px;font-weight:700;color:#e8f5e8">${a}
        <span style="font-size:9px;color:${parseFloat(d)<=0?"#5ba85e":"#ba6b6b"}">(${parseFloat(d)>0?"+":""}${d})</span></div>
    </div>`;
  }).join("");
  // Recent rounds
  document.getElementById("ds-rounds").innerHTML=rs.slice(0,10).map(r=>`
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #1a2e1b">
      <div><div style="font-size:11px;font-weight:700;color:#e8f5e8">${r.courseName}</div>
        <div style="font-size:8px;color:#4a7a4a">${fmtD(r.date)}</div></div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:700;color:#e8f5e8">${r.totalStrokes||"--"}</div>
        ${r.scoreDifferential?`<div style="font-size:8px;color:#4a7a4a">Diff ${parseFloat(r.scoreDifferential).toFixed(1)}</div>`:""}
      </div></div>`).join("")||'<div style="color:#2a4a2a;font-size:10px">No rounds yet.</div>';
}

//    WHS Handicap                                                   
function calcHcp(){
  const diffs=rounds.filter(r=>r.scoreDifferential!=null&&r.scoreDifferential!=="")
    .sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(-20)
    .map(r=>parseFloat(r.scoreDifferential)).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
  if(!diffs.length)return null;
  const n=diffs.length;
  const use=n>=20?8:n>=19?7:n>=17?6:n>=15?5:n>=13?4:n>=11?3:n>=9?2:n>=7?1:n>=5?1:0;
  if(!use)return null;
  return Math.floor((diffs.slice(0,use).reduce((a,b)=>a+b,0)/use)*0.96*10)/10;
}

function dRenderHcp(){
  const hcp=calcHcp();
  document.getElementById("dh-idx").textContent=hcp!==null?hcp.toFixed(1):"--";
  const elig=rounds.filter(r=>r.scoreDifferential!=null&&r.scoreDifferential!=="");
  document.getElementById("dh-based").textContent="Based on "+elig.length+" round"+(elig.length!==1?"s":"");
  // Trend
  const sorted=[...elig].sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(-20);
  const svg=document.getElementById("dh-trend");
  if(sorted.length<2){svg.innerHTML='<text x="170" y="55" text-anchor="middle" fill="#2a4a2a" font-size="10" font-family="monospace">Need at least 2 rounds</text>';
  }else{
    const diffs=sorted.map(r=>parseFloat(r.scoreDifferential));
    const mxD=Math.max(...diffs),mnD=Math.min(...diffs);
    const W=340,H=110,P=18;
    const xS=(W-P*2)/(diffs.length-1);
    const yS=(H-P*2)/((mxD-mnD)||1);
    const pts=diffs.map((d,i)=>`${(P+i*xS).toFixed(1)},${(H-P-(d-mnD)*yS).toFixed(1)}`).join(" ");
    svg.innerHTML=`<polyline points="${pts}" fill="none" stroke="#5ba85e" stroke-width="2"/>
    ${diffs.map((d,i)=>`<circle cx="${(P+i*xS).toFixed(1)}" cy="${(H-P-(d-mnD)*yS).toFixed(1)}" r="3" fill="#5ba85e"/>
    <text x="${(P+i*xS).toFixed(1)}" y="${(H-P-(d-mnD)*yS-7).toFixed(1)}" text-anchor="middle" fill="#4a7a4a" font-size="6" font-family="monospace">${d.toFixed(1)}</text>`).join("")}
    <text x="4" y="${H-4}" fill="#2a4a2a" font-size="7" font-family="monospace">${fmtD(sorted[0].date)}</text>
    <text x="${W-4}" y="${H-4}" text-anchor="end" fill="#2a4a2a" font-size="7" font-family="monospace">${fmtD(sorted[sorted.length-1].date)}</text>`;
  }
  // Differentials table
  document.getElementById("dh-diffs").innerHTML=[...elig].reverse().slice(0,20).map((r,i)=>{
    const d=parseFloat(r.scoreDifferential);
    return`<div style="display:flex;justify-content:space-between;align-items:center;
      padding:6px 0;border-bottom:1px solid #1a2e1b">
      <div><div style="font-size:10px;color:#e8f5e8">${r.courseName}</div>
        <div style="font-size:8px;color:#4a7a4a">${fmtD(r.date)}</div></div>
      <div style="display:flex;align-items:center;gap:7px">
        ${i<8?'<div style="font-size:7px;color:#5ba85e">★ USED</div>':""}
        <div style="font-size:12px;font-weight:700;color:${d<0?"#5ba85e":"#e8f5e8"}">${d.toFixed(1)}</div>
      </div></div>`;
  }).join("")||'<div style="color:#2a4a2a;font-size:10px">No differentials yet.</div>';
}

//                             START                            
// Safety net: always show app after 1.5s even if JS crashes
setTimeout(function(){
  try{
    var ls=document.getElementById("loading-screen");
    var ph=document.getElementById("page-home");
    if(ls){ls.style.display="none";}
    if(ph){ph.classList.add("active");}
  }catch(e){}
}, 1500);

// Run boot
try{ boot(); }catch(e){
  console.error("Boot failed:",e);
  try{
    document.getElementById("loading-screen").style.display="none";
    document.getElementById("page-home").classList.add("active");
    updateHome();
  }catch(e2){}
}
