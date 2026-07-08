import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env={};for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'').trim()}
const sb=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const URL=env.ODOO_URL,DB=env.ODOO_DB,USER=env.ODOO_USERNAME,PWD=env.ODOO_PASSWORD
async function orpc(s,m,a){const r=await fetch(`${URL}/jsonrpc`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'call',params:{service:s,method:m,args:a},id:1})});const d=await r.json();if(d.error)throw new Error(JSON.stringify(d.error.data?.message||d.error.message));return d.result}
const uid=await orpc('common','authenticate',[DB,USER,PWD,{}])
const osr=(model,domain,fields)=>orpc('object','execute_kw',[DB,uid,PWD,model,'search_read',[domain,fields]])
const API='https://lily-gourmet-odoo.vercel.app/api/wati-webhook?action=order-line'
const post=b=>fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json())
const ord=(await sb.from('orders').select('id').eq('order_num','S49984').single()).data
const getUrls=async()=>{const{data}=await sb.from('order_items').select('image_urls').eq('order_id',ord.id).eq('odoo_line_id',204925).single();return data.image_urls||[]}
console.log('AVANT  → image_urls:',(await getUrls()).length)
// 1x1 png rouge (test)
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
console.log('… ajout photo test sur la ligne 204925')
console.log('  réponse:',JSON.stringify(await post({op:'update',orderId:49984,lineId:204925,photo:{name:'TEST_e2e.png',data:png,mimetype:'image/png'}})))
await new Promise(r=>setTimeout(r,1500))
console.log('APRÈS AJOUT → image_urls:',(await getUrls()).length)
// trouver l'attachement test (checksum != celui de coller.png)
const atts=await osr('ir.attachment',[['res_model','=','sale.order.line'],['res_id','=',204925],['mimetype','ilike','image']],['id','name','checksum'])
const testAtt=atts.find(a=>a.name==='TEST_e2e.png')
console.log('  pièce jointe test #',testAtt?.id)
console.log('… retrait de la photo test')
console.log('  réponse:',JSON.stringify(await post({op:'photo-remove',orderId:49984,attId:testAtt.id})))
await new Promise(r=>setTimeout(r,1500))
console.log('APRÈS RETRAIT → image_urls:',(await getUrls()).length,'(doit être revenu au départ)')
