import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s);};
// Bank refunds reduce expenses without being counted as new income.
const finance=read('core/finance.cjs').replace('({...r,derived:false})','({...r,amount:r.reversal?-r.amount:r.amount,derived:false})');
write('supabase/functions/_shared/finance.mjs',finance.replace('module.exports=','export default '));
if(fs.existsSync(path.join(root,'core/database.cjs'))){
const db=read('core/database.cjs');
const validation=db.slice(db.indexOf(' validate(r,all=this.all()){'),db.indexOf('\n put(r)')).replace(' validate(r,all=this.all()){','export function validate(r,all){');
const constants=db.slice(db.indexOf('const kinds='),db.indexOf('class Store'));
write('supabase/functions/_shared/validation.mjs',`// Generated from the desktop rules by web/build.mjs.\nimport F from './finance.mjs';\n${constants}\n${validation}\nexport {defaults,kinds};\n`);
}
let importer=read('core/importer.cjs');
importer=importer.replace("const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');",'');
importer=importer.replace("const {unzipSync,strFromU8}=require('fflate');const {XMLParser}=require('fast-xml-parser');const F=require('./finance.cjs');",`import {unzipSync,strFromU8} from 'fflate';import {XMLParser} from 'fast-xml-parser';const F=window.F;const path={posix:{normalize(value){const parts=[];for(const p of value.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p);}return parts.join('/');}}};`);
importer=importer.slice(0,importer.indexOf('function readFile(file)'))+importer.slice(importer.indexOf('function planImport('));
importer=importer.replace('module.exports={readXlsx,fromSnapshot,readFile,planImport,excelDate};','export {readXlsx,fromSnapshot,planImport};');
write('web/generated/importer.js',importer);
const out=path.join(root,'web/dist');fs.mkdirSync(out,{recursive:true});
for(const [from,to] of [['ui/styles.css','styles.css'],['web/index.html','index.html'],['web/web.css','web.css']])fs.copyFileSync(path.join(root,from),path.join(out,to));
let app=read('ui/app.js');
app=app.replace('Seus dados, no seu computador.<br>Modo offline · v1.0.0','Sua conta, em todos os dispositivos.<br>Norte Web · Supabase');
app=app.replace('<div class="avatar" title="Conta local">EU</div>',"${button('Sair','web-logout','','small flat')}");
app=app.replace("async function doAction(action,el){", "async function doAction(action,el){if(action.startsWith('web-')){await window.norte.action(action,el);await refresh();return;}");
app=app.replace("case 'navigate':route=el.dataset.route;", "case 'navigate':if(innerWidth<=700)document.body.classList.remove('collapsed');route=el.dataset.route;");
app=app.replace("window.addEventListener('error',", "routes.splice(routes.length-1,0,['bank','Conexão bancária','card']);views.bank=()=>window.norte.bankView(state);views.settings=()=>window.norte.settingsView(state);window.norte.createBankCategory=row=>{const form=row.querySelector('form'),select=form.elements.categoryId;if(!select.dataset.quickCreate){select.remove(select.options.length-1);enableCategoryCreation(form,'entry');select.dataset.quickCreate='true';select.addEventListener('change',()=>{const category=byId(select.value);if(category)form.elements.type.value=category.type;});}select.value='__new_category__';select.dispatchEvent(new Event('change',{bubbles:true}));};\nwindow.addEventListener('error',");
app=app.replace("refresh().catch(e=>", "window.norte.refresh=refresh;refresh().then(()=>window.norte.afterLoad()).catch(e=>");
write('web/dist/app.js',app);
write('web/dist/finance.js',finance.replace('module.exports=','window.F='));
const url=process.env.NORTE_SUPABASE_URL||'',key=process.env.NORTE_SUPABASE_PUBLISHABLE_KEY||'';
if(key.startsWith('sb_secret_'))throw Error('Use somente a chave publicável.');
if(key.startsWith('eyJ')){const role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;if(role!=='anon')throw Error('Chave privada recusada no site.');}
if(url&&new URL(url).protocol!=='https:')throw Error('Supabase requer HTTPS.');
write('web/dist/config.js',`window.NORTE_CONFIG=${JSON.stringify({url,key})};\n`);
await build({entryPoints:[path.join(root,'web/src/main.js')],bundle:true,format:'iife',outfile:path.join(out,'web.js'),minify:true,target:['es2022'],legalComments:'eof'});
write('web/dist/.nojekyll','');
console.log('Site gerado em web/dist. Nenhum teste foi executado.');
