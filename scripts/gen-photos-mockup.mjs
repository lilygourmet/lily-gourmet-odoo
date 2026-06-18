// Maquette HTML : bibliothèque d'éléments (PSD) -> planches A4.
// - Photo libre (Aucune) : largeur + hauteur réglables (déformable), proportions verrouillables
// - Formes : rond/carré/cœur/losange/hexagone + remplissage + zoom
// - Ajouter une photo, supprimer un élément, rotation, quantité, contour fin des formes
//   node scripts/gen-photos-mockup.mjs "Spiderman LS"
import { readdirSync, writeFileSync } from 'node:fs'
const stem = process.argv[2] || 'Spiderman LS'
const dir = `cake-photos/${stem}`
const files = readdirSync(dir).filter(f => /\.png$/i.test(f)).sort((a,b)=>parseInt(a)-parseInt(b))
const rel = f => '../' + encodeURI(`cake-photos/${stem}/${f}`)
const items = files.map((f, i) => ({ id: i + 1, nom: f.replace(/^\d+\s/, '').replace(/\.png$/i, ''), src: rel(f) }))

const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Maquette — Photos gâteaux (${stem})</title>
<style>
  :root{--cream:#F4F0EA;--cream-warm:#FBF7F0;--ink:#1a0f0a;--ink-soft:#5b4a40;--ink-mute:#8a7a70;--bordeaux:#993556;--line:#e8dcc9}
  *{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px}
  header{background:var(--bordeaux);color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}
  header h1{margin:0;font-size:16px}.tag{font-size:11px;background:rgba(255,255,255,.18);padding:3px 9px;border-radius:20px}
  .wrap{display:flex;min-height:calc(100vh - 48px)}
  .lib{flex:1;padding:12px;min-width:0}
  .search{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
  .card{position:relative;background:#fff;border:1px solid var(--line);border-radius:12px;padding:6px;cursor:pointer;text-align:center}
  .card:hover{border-color:var(--bordeaux)}.card.sel{outline:2px solid var(--bordeaux)}
  .card img{width:100%;height:90px;object-fit:contain}
  .card .nm{font-size:10.5px;color:var(--ink-soft);margin-top:4px;line-height:1.1;height:24px;overflow:hidden}
  .del{position:absolute;top:-7px;right:-7px;width:22px;height:22px;border-radius:50%;border:none;background:#b42424;color:#fff;font-size:13px;font-weight:800;cursor:pointer;line-height:1;display:none}
  .card:hover .del{display:block}
  .add{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1.5px dashed var(--bordeaux);color:var(--bordeaux);font-weight:800;font-size:13px;border-radius:12px;min-height:120px;cursor:pointer;background:#faf4ee;text-align:center}
  .panel{width:455px;flex-shrink:0;border-left:1px solid var(--line);background:var(--cream-warm);padding:14px;position:sticky;top:0;height:calc(100vh - 48px);overflow:auto}
  .empty{color:var(--ink-mute);text-align:center;margin-top:50px}
  .prev{height:150px;display:flex;align-items:center;justify-content:center;background:#efe7d8;border:1px solid var(--line);border-radius:12px;margin-bottom:10px}
  .pcell{overflow:hidden}.pcell img{width:100%;height:100%}
  .lab{font-size:10.5px;font-weight:700;color:var(--ink-soft);margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px;display:block}
  .mb{margin-bottom:9px}.row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
  select.sel{width:100%;padding:7px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:13px}
  .mini{display:flex;align-items:center;gap:5px}
  .mini button{width:26px;height:26px;border-radius:7px;border:1px solid var(--bordeaux);background:#fff;color:var(--bordeaux);font-size:15px;font-weight:800;cursor:pointer;line-height:1;padding:0}
  .mini input{width:46px;text-align:center;font-weight:700;font-size:13px;border:1px solid var(--line);border-radius:7px;padding:4px}
  .tgl{padding:6px 9px;border-radius:8px;border:1px solid var(--bordeaux);background:#fff;color:var(--bordeaux);font-weight:700;font-size:11.5px;cursor:pointer;white-space:nowrap}
  .calc{background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:12.5px;margin:9px 0}.calc b{color:var(--bordeaux)}
  .pages{display:flex;flex-direction:column;gap:14px;margin-bottom:12px}
  .pglbl{font-size:11px;color:var(--ink-mute);margin-bottom:4px}
  .page{position:relative;width:100%;aspect-ratio:210/297;background:#fff;border:1px solid #ccc;box-shadow:0 2px 6px rgba(0,0,0,.08)}
  .page .cell{position:absolute;overflow:hidden}.page .cell img{width:100%;height:100%}
  .btns{display:flex;gap:8px}.btn{flex:1;padding:10px;border-radius:11px;font-weight:700;border:none;cursor:pointer}.btn-primary{background:var(--bordeaux);color:#fff}.btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink-soft)}
  @media(max-width:780px){.wrap{flex-direction:column}.panel{width:auto;position:static;height:auto}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>
  <clipPath id="clpHeart" clipPathUnits="objectBoundingBox"><path d="M0.5,1 C0.5,1,0.02,0.68,0.02,0.3 C0.02,0.1,0.2,0.0,0.35,0.0 C0.45,0.0,0.5,0.09,0.5,0.16 C0.5,0.09,0.55,0.0,0.65,0.0 C0.8,0.0,0.98,0.1,0.98,0.3 C0.98,0.68,0.5,1,0.5,1 Z"/></clipPath>
</defs></svg>
<header><h1>🎂 Photos gâteaux — ${stem}</h1><span class="tag">maquette</span></header>
<div class="wrap">
  <div class="lib"><input class="search" id="q" placeholder="Chercher (masque, drapeau, chiffre, BOOM…)" oninput="render()"><div class="grid" id="grid"></div>
    <input type="file" id="addInput" accept="image/*" multiple style="display:none" onchange="addPhotos(event)"></div>
  <div class="panel"><div class="empty" id="empty">👈 Choisis un élément.</div>
    <div id="ed" style="display:none">
      <div class="prev"><div id="pwrap" style="position:relative"><div class="pcell" id="pcell"><img id="pimg"></div><span id="pout"></span></div></div>
      <div id="dim" style="text-align:center;font-weight:800;color:var(--bordeaux);font-size:15px;margin-bottom:8px"></div>
      <div class="row mb">
        <div style="flex:1"><span class="lab">Forme</span>
          <select class="sel" id="fForme" onchange="onForme()">
            <option value="none">Aucune (photo détourée)</option><option value="rond">Rond / ovale</option>
            <option value="carre">Carré</option><option value="arrondi">Carré arrondi</option>
            <option value="coeur">Cœur</option><option value="losange">Losange</option><option value="hexagone">Hexagone</option>
          </select>
        </div>
        <div style="flex:1" id="fitField"><span class="lab">Photo dans la forme</span>
          <select class="sel" id="fFit" onchange="onFit()">
            <option value="cover">Remplir (proportions gardées)</option><option value="contain">Entière (tout visible)</option><option value="fill">Déformer (étirer)</option>
          </select>
        </div>
      </div>
      <div class="row mb">
        <div><span class="lab" id="wLab">Largeur (cm)</span><div class="mini"><button onclick="bump('w',-1)">−</button><input id="fw" type="number" step="0.5" oninput="onDim('w')"><button onclick="bump('w',1)">+</button></div></div>
        <div><span class="lab">Hauteur (cm)</span><div class="mini"><button onclick="bump('h',-1)">−</button><input id="fh" type="number" step="0.5" oninput="onDim('h')"><button onclick="bump('h',1)">+</button></div></div>
        <button class="tgl" id="propBtn" onclick="toggleProp()">🔓 Déformer</button>
      </div>
      <div class="mb" id="zoomRow"><span class="lab">Zoom photo dans la forme : <span id="zlbl">100</span>%</span><input id="fz" type="range" min="40" max="320" value="100" oninput="onZoom()" style="width:100%"></div>
      <div class="row mb">
        <div><span class="lab">Rotation (°)</span><div class="mini"><button onclick="rot(-90)">↺</button><input id="frot" type="number" step="5" oninput="onRot()"><button onclick="rot(90)">↻</button></div></div>
        <div><span class="lab">Quantité</span><div class="mini"><button onclick="bump('q',-1)">−</button><input id="fq" type="number" oninput="onDim('q')"><button onclick="bump('q',1)">+</button></div></div>
      </div>
      <div class="pages" id="pages"></div>
      <div class="btns"><button class="btn btn-ghost" onclick="alert('(maquette) réglages mémorisés')">💾 Enregistrer</button><button class="btn btn-primary" onclick="alert('(maquette) impression')">🖨️ Imprimer</button></div>
    </div>
  </div>
</div>
<script>
  let ITEMS=${JSON.stringify(items)};
  const CMW=21, CMH=29.7, MARG=1, GAP=0.3;
  let st=null, prop=false;
  const $=id=>document.getElementById(id);
  function shapeCss(f){
    if(f==='rond') return 'border-radius:50%'; if(f==='arrondi') return 'border-radius:16%';
    if(f==='losange') return 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)';
    if(f==='hexagone') return 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)';
    if(f==='coeur') return 'clip-path:url(#clpHeart)'; return '';
  }
  function fitNow(){ return st.forme==='none' ? 'fill' : st.fit; }   // photo libre = remplit sa case (déformable)
  function imgStyle(){ return 'object-fit:'+fitNow()+';transform:rotate('+(st.rot||0)+'deg) scale('+(st.zoom/100)+')'; }
  function outlineSvg(f, style){
    if(f==='none') return '';
    const s='stroke="#cfc7ba" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"'; let shp='';
    if(f==='rond') shp='<ellipse cx="50" cy="50" rx="49.5" ry="49.5" '+s+'/>';
    else if(f==='carre') shp='<rect x="0.5" y="0.5" width="99" height="99" '+s+'/>';
    else if(f==='arrondi') shp='<rect x="0.5" y="0.5" width="99" height="99" rx="16" ry="16" '+s+'/>';
    else if(f==='losange') shp='<polygon points="50,0.5 99.5,50 50,99.5 0.5,50" '+s+'/>';
    else if(f==='hexagone') shp='<polygon points="25,0.5 75,0.5 99.5,50 75,99.5 25,99.5 0.5,50" '+s+'/>';
    else if(f==='coeur') shp='<path d="M50,99 C50,99,2.5,68,2.5,30 C2.5,11,20,1,35,1 C45,1,50,9.5,50,16 C50,9.5,55,1,65,1 C80,1,97.5,11,97.5,30 C97.5,68,50,99,50,99 Z" '+s+'/>';
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="'+style+';pointer-events:none">'+shp+'</svg>';
  }

  function render(){const q=($('q').value||'').toLowerCase();
    $('grid').innerHTML='<div class="add" onclick="$(\\'addInput\\').click()">＋<br>Ajouter<br>une photo</div>'
      + ITEMS.filter(x=>x.nom.toLowerCase().includes(q)).map(x=>
      '<div class="card '+(st&&st.id===x.id?'sel':'')+'" onclick="pick('+x.id+')"><button class="del" onclick="event.stopPropagation();delItem('+x.id+')">✕</button><img src="'+x.src+'" loading="lazy"><div class="nm">'+x.nom+'</div></div>').join('');}
  function addPhotos(e){ for(const f of e.target.files){ const id=Math.max(0,...ITEMS.map(i=>i.id))+1; ITEMS.push({id,nom:f.name.replace(/\\.[^.]+$/,''),src:URL.createObjectURL(f)}); } e.target.value=''; render(); }
  function delItem(id){ if(!confirm('Supprimer cet élément de la bibliothèque ?'))return; ITEMS=ITEMS.filter(x=>x.id!==id); if(st&&st.id===id){st=null;$('ed').style.display='none';$('empty').style.display='block';} render(); }

  function propLabel(){ const none=st.forme==='none', b=$('propBtn');
    if(prop){ b.style.background='#fbeef2'; b.textContent= none?'🔒 Proportions':'🔒 Carrée/ronde'; }
    else{ b.style.background='#fff'; b.textContent= none?'🔓 Déformer':'⬜ Forme libre'; } }
  function snapProp(){ if(!prop)return; const none=st.forme==='none';
    st.h = none ? Math.max(0.5,Math.round(st.w/st.ratio*2)/2) : st.w; $('fh').value=st.h; }
  function applyVis(none){ $('fitField').style.display=none?'none':''; $('zoomRow').style.display=none?'none':'';
    $('wLab').textContent=none?'Largeur photo (cm)':'Largeur forme (cm)'; propLabel(); }

  function pick(id){const it=ITEMS.find(x=>x.id===id); prop=true; st={id,src:it.src,forme:'none',fit:'cover',w:5,h:5,zoom:100,rot:0,q:1,ratio:1};
    $('empty').style.display='none';$('ed').style.display='block';$('fForme').value='none';$('fFit').value='cover';
    const pimg=$('pimg'); pimg.onload=()=>{ st.ratio=pimg.naturalWidth/pimg.naturalHeight||1; st.h=Math.max(0.5,Math.round(st.w/st.ratio*2)/2); $('fh').value=st.h; draw(); };
    pimg.src=it.src; $('fw').value=st.w;$('fh').value=st.h;$('fz').value=100;$('zlbl').textContent='100';$('frot').value=0;$('fq').value=st.q;
    applyVis(true); draw(); render();}

  function onForme(){ st.forme=$('fForme').value; applyVis(st.forme==='none'); snapProp(); draw(); }
  function onFit(){ st.fit=$('fFit').value; draw(); }
  function onZoom(){ st.zoom=parseInt($('fz').value)||100; $('zlbl').textContent=st.zoom; draw(); }
  function onRot(){ st.rot=parseFloat($('frot').value)||0; draw(); }
  function rot(d){ st.rot=((((st.rot||0)+d)%360)+360)%360; $('frot').value=st.rot; draw(); }
  function toggleProp(){ prop=!prop; propLabel(); snapProp(); draw(); }
  function onDim(k){
    if(k==='q'){ st.q=Math.max(1,parseInt($('fq').value)||1); draw(); return; }
    if(k==='w'){ st.w=Math.max(0.5,parseFloat($('fw').value)||1); if(prop) snapProp(); }
    else{ st.h=Math.max(0.5,parseFloat($('fh').value)||1); if(prop){ const none=st.forme==='none'; st.w=none?Math.max(0.5,Math.round(st.h*st.ratio*2)/2):st.h; $('fw').value=st.w; } }
    draw();
  }
  function bump(k,d){
    if(k==='q'){ st.q=Math.max(1,st.q+d); $('fq').value=st.q; draw(); return; }
    const id=k==='w'?'fw':'fh', cur=parseFloat($(id).value)||1; $(id).value=Math.max(0.5,Math.round((cur+d*0.5)*2)/2); onDim(k);
  }

  function draw(){
    const sc=Math.min(130/st.w,130/st.h), pw=$('pwrap'); pw.style.width=(st.w*sc)+'px'; pw.style.height=(st.h*sc)+'px';
    $('pcell').style.cssText='overflow:hidden;width:100%;height:100%;background:'+(st.forme==='none'?'transparent':'#fff')+';'+shapeCss(st.forme);
    $('pimg').style.cssText=imgStyle();
    $('pout').innerHTML=outlineSvg(st.forme,'position:absolute;inset:0;width:100%;height:100%');
    $('dim').textContent='📐 '+st.w+' × '+st.h+' cm';
    const w=st.w,h=st.h;
    const perRow=Math.max(1,Math.floor((CMW-2*MARG+GAP)/(w+GAP)));
    const perCol=Math.max(1,Math.floor((CMH-2*MARG+GAP)/(h+GAP)));
    const perPage=perRow*perCol, pages=Math.ceil(st.q/perPage);
    let html='';
    for(let p=0;p<pages;p++){
      const count=Math.min(perPage, st.q - p*perPage); let cells='';
      for(let k=0;k<count;k++){
        const row=Math.floor(k/perRow), col=k%perRow, x=MARG+col*(w+GAP), y=MARG+row*(h+GAP);
        const pos='left:'+(x/CMW*100)+'%;top:'+(y/CMH*100)+'%;width:'+(w/CMW*100)+'%;height:'+(h/CMH*100)+'%';
        cells+='<div class="cell" style="'+pos+';'+shapeCss(st.forme)+'"><img src="'+st.src+'" style="'+imgStyle()+'"></div>'+outlineSvg(st.forme,'position:absolute;'+pos);
      }
      html+='<div><div class="pglbl">Page '+(p+1)+'/'+pages+' — '+count+'</div><div class="page">'+cells+'</div></div>';
    }
    $('pages').innerHTML=html;
  }
  render();
</script></body></html>`
writeFileSync('mockups/photos-gateaux-reel.html', html)
console.log('Maquette écrite: mockups/photos-gateaux-reel.html (' + items.length + ' éléments)')
