import { readFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as agPsd from 'ag-psd'
agPsd.initializeCanvas(createCanvas)
const dir = "/Users/layla/Desktop/Ancien ordi/LG/PSD/"
for (const f of process.argv.slice(2)) {
  try {
    const psd = agPsd.readPsd(readFileSync(dir+f), { skipCompositeImageData:true, skipThumbnail:true })
    console.log(`\n### ${f}  (${psd.width}x${psd.height})`)
    let n=0
    const walk=(ls,d)=>{ for(const l of (ls||[])){ if(l.children){console.log('  '.repeat(d)+'D '+(l.name||'')); walk(l.children,d+1); continue}
      const w=(l.right-l.left)||0,h=(l.bottom-l.top)||0; const t=l.text?' [TXT:"'+(l.text.text||'').slice(0,20)+'"]':''
      console.log('  '.repeat(d)+`- ${l.name||'?'} ${w}x${h}${t}${l.canvas?'':' (vide)'}`); n++ } }
    walk(psd.children,0); console.log('  total calques:',n)
  } catch(e){ console.log(f,'ERREUR',e.message.split('\n')[0]) }
}
