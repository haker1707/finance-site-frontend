import {createClient} from '@supabase/supabase-js';
import {PluggyConnect} from 'pluggy-connect-sdk';
import {readXlsx,fromSnapshot,planImport} from '../generated/importer.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((n||0)/100);
const config=window.NORTE_CONFIG||{};
let client,revision=0,lastState=null,selectedFile=null,preview=null,loaded=false,recovering=location.hash.includes('type=recovery'),syncing=false,widget=null,workspaceId='';
const message=(text,error=false)=>{const node=document.querySelector('#toast');node.textContent=text;node.style.display='block';node.style.background=error?'var(--red)':'var(--accent)';clearTimeout(message.timer);message.timer=setTimeout(()=>node.style.display='none',8000);};
function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return name;}
function filePicker(accept){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.hidden=true;document.body.append(input);input.addEventListener('change',()=>{const file=input.files[0]||null;input.remove();resolve(file);},{once:true});input.addEventListener('cancel',()=>{input.remove();resolve(null);},{once:true});input.click();});}
async function request(action,payload={}){
 const {data:{session},error}=await client.auth.getSession();if(error||!session)throw Error('Entre na sua conta novamente.');
 const response=await fetch(config.url+'/functions/v1/norte',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key,Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,payload,revision,workspaceId}),signal:AbortSignal.timeout(action==='bank-sync'?170000:40000)});
 let result;try{result=await response.json();}catch{throw Error('O servidor ainda não está disponível. Confira a implantação da função Norte.');}
 if(!response.ok||result.error){if(response.status===401||response.status===403){lastState=null;workspaceId='';window.norte.clearPrivateData?.();document.querySelector('#app').innerHTML='<section class="auth-card"><h2>Acesso indisponível</h2><p>Sua autorização terminou ou a sessão expirou. Entre novamente para consultar as contas disponíveis.</p><a href="./">Voltar ao acesso</a></section>';}throw Error(result.error||'Não foi possível concluir.');}
 if(result.revision!==undefined)revision=result.revision;
 return result.value;
}
async function call(action,p={}){
 if(lastState?.role==='consultant'&&!['state','csv'].includes(action))throw Error('O acesso do consultor permite somente leitura.');
 if(action==='state'){lastState=await request('state');revision=lastState.revision;return lastState;}
 if(action==='chooseImport'){selectedFile=await filePicker('.xlsx,.json');preview=null;return selectedFile?.name||null;}
 if(action==='preview'){
  if(!selectedFile)throw Error('Selecione uma planilha.');if(selectedFile.size>30*1024*1024)throw Error('O limite é 30 MB.');
  const bytes=new Uint8Array(await selectedFile.arrayBuffer());const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  const book=selectedFile.name.toLowerCase().endsWith('.json')?fromSnapshot(JSON.parse(new TextDecoder().decode(bytes))):readXlsx(bytes);
  preview=planImport({book,hash,name:selectedFile.name},p);return preview;
 }
 if(action==='import'){if(!preview)throw Error('Confira a planilha primeiro.');const result=await request('import',{...p,plan:preview});preview=null;return result;}
 if(action==='backup'){const state=await call('state');return download('Norte-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'norte-web-1',exportedAt:new Date().toISOString(),data:{records:state.records,settings:state.settings,imports:state.imports}},null,2));}
 if(action==='restore'){
  const file=await filePicker('.json');if(!file)return null;if(file.size>18*1024*1024)throw Error('Backup acima de 18 MB.');const backup=JSON.parse(await file.text());
  if(backup.format!=='norte-web-1')throw Error('Selecione um backup JSON do Norte Web. Backups SQLite pertencem ao aplicativo portátil.');
  if(!confirm('Substituir os registros do site por este backup? Primeiro será baixada uma cópia dos dados atuais.'))return null;
  await call('backup');return request('restore',{backup,confirm:true});
 }
 if(action==='csv'){
  const state=await call('state');const cats=new Map(state.records.filter(r=>r.kind==='category').map(r=>[r.id,r.name]));
  const cell=x=>'"'+String(x??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  const rows=[['Data','Descrição','Natureza','Categoria','Valor (R$)','Origem'],...window.F.ledger(state.records).filter(x=>!p.period||x.date.startsWith(p.period)).map(x=>[x.date,x.description,window.F.TYPES[x.type],cats.get(x.categoryId)||'',(x.amount/100).toFixed(2).replace('.',','),x.source||'Manual'])];
  return download('Norte-lancamentos.csv','\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
 }
 return request(action,p);
}
function settingsView(state){return `<div class="heading"><div><div class="eyebrow">SUA CONTA</div><h1>Dados e preferências</h1><p>Seu histórico privado, disponível nos seus dispositivos.</p></div></div><div class="equal-col"><section class="panel"><h2>Backup dos registros</h2><p>Baixe uma cópia em JSON. Ao restaurar, o Norte baixa primeiro uma cópia dos registros atuais. Guarde esse arquivo em um local privado.</p><div class="row"><button class="primary" data-action="backup">Exportar backup</button><button data-action="restore">Restaurar backup</button></div><div class="notice">O backup do site inclui registros, categorias e preferências. Autorizações bancárias ficam fora do arquivo. O backup SQLite do aplicativo portátil não é compatível com esta restauração.</div></section><section class="panel"><h2>Sua conta no Supabase</h2><p>Os registros são salvos no servidor. É preciso estar conectado à internet para consultar e salvar alterações.</p><button data-action="web-reload">Atualizar dados</button><div class="balance-block"><h3>Aparência</h3><p>Tema ${state.settings.theme==='light'?'claro':'escuro'}</p><button data-action="theme">Alternar tema</button></div><p class="export-note">O site não cria backups automáticos locais. A retenção de backups do banco depende do plano contratado no Supabase.</p></section></div><section class="panel"><h2>Importações</h2>${state.imports.length?state.imports.map(i=>`<p>${escape(i.name)} · ${escape(i.year)} · ${escape(i.date)}</p>`).join(''):'<p>Nenhuma importação realizada.</p>'}</section>`;}
let bankPage=0,bankFilter='review';
function bankView(state){
 const inbox=state.bankInbox||[];const pending=inbox.filter(t=>t.decision==='review');
 const rows=(bankFilter==='all'?inbox:pending).slice().sort((a,b)=>b.date.localeCompare(a.date));bankPage=Math.min(bankPage,Math.max(0,Math.ceil(rows.length/30)-1));
 const conn=state.connection;
 return `<div class="heading"><div><div class="eyebrow">OPEN FINANCE</div><h1>Conexão bancária</h1><p>Nubank pelo Meu Pluggy · ${pending.length} movimentações para revisar.</p></div></div><section class="panel"><h2>${conn?'Meu Pluggy conectado':'Conecte seu Nubank'}</h2><p>Primeiro, conecte o Nubank no <a href="https://meu.pluggy.ai" target="_blank" rel="noopener noreferrer">Meu Pluggy</a>. Depois, autorize o Norte a consultar essa conexão. Os dados passam pela Pluggy e ficam no seu projeto Supabase.</p>${!state.bankEnabled?'<div class="notice">A integração está preparada, mas as credenciais Pluggy ainda precisam ser configuradas no servidor.</div>':''}<div class="row"><button class="primary" data-action="web-connect" ${!state.bankEnabled?'disabled':''}>${conn?'Renovar autorização':'Conectar Meu Pluggy'}</button>${conn?'<button data-action="web-sync">Sincronizar agora</button><button class="danger" data-action="web-disconnect">Desvincular</button>':''}</div><p class="connection-status tiny">${conn?.lastSync?'Última consulta do Norte: '+escape(new Date(conn.lastSync).toLocaleString('pt-BR')):'Ainda sem sincronização.'}</p><div class="notice">O Meu Pluggy atualiza o banco a cada 24 horas. O Norte consulta os dados disponíveis ao abrir e pelo botão acima. Compras confirmadas e salários identificados entram automaticamente; os demais movimentos ficam para revisão. Lançamentos bancários usam a data informada pelo banco, sem gerar parcelas futuras. Se você já cadastrou uma compra manualmente, confira a sobreposição.</div><details><summary>Recuperar uma conexão autorizada</summary><p class="tiny">Se fechou a janela antes de concluir, informe o Item ID da conexão criada pelo Norte no painel Pluggy. Só aceitamos conexões vinculadas à sua conta Norte.</p><input id="recover-item" aria-label="Item ID" placeholder="Item ID"><button data-action="web-recover-item">Recuperar</button></details></section><section class="panel"><div class="panel-head"><h2>Movimentações</h2><button data-action="web-bank-filter">${bankFilter==='review'?'Mostrar todas':'Mostrar somente revisão'}</button></div>${rows.length?rows.slice(bankPage*30,(bankPage+1)*30).map(tx=>bankRow(tx,state)).join(''):'<div class="empty"><h2>Nenhuma movimentação nesta lista</h2><p>Os dados aparecerão após a conexão e a sincronização.</p></div>'}<div class="pagination"><span>${rows.length} movimentações · página ${bankPage+1}</span><div class="row"><button data-action="web-bank-prev" ${bankPage===0?'disabled':''}>Anterior</button><button data-action="web-bank-next" ${(bankPage+1)*30>=rows.length?'disabled':''}>Próxima</button></div></div></section>`;
}
function bankRow(tx,state){
 const ready=tx.status==='POSTED'&&tx.currency==='BRL'&&tx.amount>0&&!tx.entryId;
 const status=tx.decision==='imported'?'Importado':tx.decision==='ignored'?'Ignorado':tx.status==='PENDING'?'Pendente no banco':'Revisar';
 return `<article class="bank-item" data-bank-key="${escape(tx.key)}"><div class="bank-meta"><div class="bank-description"><strong>${escape(tx.description)}</strong><p class="tiny">${escape(tx.date)} · ${escape(tx.accountName)} · ${tx.type==='CREDIT'?'Entrada/crédito':'Saída/débito'}${tx.installment?' · parcela '+escape(tx.installment)+'/'+escape(tx.totalInstallments):''}</p></div><div><strong>${tx.currency==='BRL'?money(tx.amount):escape(tx.currency)+' '+escape(tx.amount/100)}</strong><p><span class="tag">${status}</span></p></div></div>${ready?`<form class="bank-controls"><select name="type" data-bank-type aria-label="Natureza da movimentação"><option value="">Escolha a natureza…</option><option value="despesa">Despesa</option><option value="receita">Receita</option><option value="transferencia">Transferência entre contas</option><option value="fatura">Pagamento de fatura</option><option value="estorno">Estorno de despesa</option><option value="investimento">Investimento</option><option value="divida">Pagamento de dívida</option></select><select name="categoryId" data-bank-category aria-label="Categoria"><option value="">Selecione a categoria…</option>${state.records.filter(c=>c.kind==='category'&&!c.archived).map(c=>`<option value="${escape(c.id)}" data-type="${c.type}">${escape(c.name)} · ${escape(window.F.TYPES[c.type])}</option>`).join('')}<option value="__new_category__">+ Adicionar nova categoria</option></select><button data-action="web-classify">Confirmar</button><button data-action="web-ignore">Ignorar</button></form>`:''}</article>`;
}
async function sync(){if(syncing)return;syncing=true;message('Consultando as movimentações disponíveis…');try{const result=await request('bank-sync');await window.norte.refresh();message(`${result.count} movimentações consultadas.`);}finally{syncing=false;}}
async function connect(){
 const result=await request('bank-token');if(widget)await widget.destroy();
 widget=new PluggyConnect({connectToken:result.connectToken,connectorIds:[200],selectedConnectorId:200,includeSandbox:false,updateItem:result.itemId,language:'pt',theme:lastState.settings.theme,
  onSuccess:async({item})=>{try{await request('bank-attach',{itemId:item.id});await window.norte.refresh();await sync();}catch(error){message(error.message,true);}},
  onError:()=>message('A conexão ainda não foi concluída. Confira sua autorização no Meu Pluggy e tente novamente.',true)
 });await widget.init();
}
async function action(action,el){
 if(action==='web-accounts')return chooseWorkspace();
 if(action==='web-access')return accessDialog();
 if(action==='web-logout'){await client.auth.signOut();location.reload();return;}
 if(action==='web-reload')return;
 if(action==='web-connect')return connect();
 if(action==='web-sync')return sync();
 if(action==='web-disconnect'){if(confirm('Desvincular o Norte? Seus registros serão mantidos. Para revogar o compartilhamento bancário, acesse o Meu Pluggy ou Nubank.'))await request('bank-disconnect');return;}
 if(action==='web-recover-item'){await request('bank-attach',{itemId:document.querySelector('#recover-item').value.trim()});return sync();}
 if(action==='web-bank-filter'){bankFilter=bankFilter==='review'?'all':'review';bankPage=0;return;}
 if(action==='web-bank-prev'){bankPage=Math.max(0,bankPage-1);return;}
 if(action==='web-bank-next'){bankPage++;return;}
 if(action==='web-ignore'||action==='web-classify'){
  const row=el.closest('[data-bank-key]');const type=action==='web-ignore'?'ignore':row.querySelector('[data-bank-type]').value;
  await request('bank-resolve',{key:row.dataset.bankKey,type,categoryId:row.querySelector('[data-bank-category]').value});return;
 }
 throw Error('Ação indisponível.');
}
window.norte={web:true,call,action,bankView,settingsView:state=>state.role==='consultant'?'<section class="panel"><h1>Acesso do consultor</h1><p>Você pode consultar esta conta. Somente o responsável pode alterar registros, gerenciar acessos e conectar bancos.</p><button data-action="web-accounts">Selecionar conta</button></section>':settingsView(state)+'<section class="panel"><h2>Quem pode acessar</h2><p>Somente você e os consultores que autorizar. Os consultores têm acesso de leitura e não podem convidar outras pessoas.</p><button data-action="web-access">Gerenciar consultores</button></section>',onRender:()=>{
  const readonly=lastState?.role==='consultant';document.body.classList.toggle('consultant',readonly);
  if(!readonly)return;
  const allowed=new Set(['navigate','collapse','csv','prev-page','next-page','schedule','web-logout','web-accounts','web-reload','web-bank-filter','web-bank-prev','web-bank-next']);
  document.querySelectorAll('[data-action]').forEach(button=>{if(!allowed.has(button.dataset.action)||button.dataset.route==='import')button.hidden=true;});
  document.querySelectorAll('#app form input,#app form select,#app form button').forEach(input=>input.disabled=true);
 },afterLoad:async()=>{if(lastState?.role==='owner'&&lastState.connection&&(!lastState.connection.lastSync||Date.now()-Date.parse(lastState.connection.lastSync)>3600000)){try{await sync();}catch(error){message(error.message,true);}}}};

async function accessDialog(){
 const rows=await request('access-list');
 const dialog=document.querySelector('#modal');
 dialog.innerHTML=`<div class="dialog-heading"><h2>Consultores autorizados</h2><button type="button" id="close-access">Fechar</button></div><p>Cadastre o e-mail do consultor. Ele deve entrar no site com esse mesmo e-mail, confirmado, e aceitar o acesso. O Norte não envia convites por e-mail.</p><form id="grant-access"><div class="field"><label for="consultant-email">E-mail do consultor</label><input id="consultant-email" name="email" type="email" autocomplete="off" required></div><button class="primary" type="submit">Autorizar leitura</button></form><div id="access-error" role="alert"></div>${rows.map(row=>`<div class="bank-item"><strong>${escape(row.consultant_email)}</strong><p>${row.accepted_at?'Acesso aceito':'Aguardando aceite'}</p><button type="button" data-revoke="${escape(row.id)}">Revogar acesso</button></div>`).join('')||'<p>Nenhum consultor autorizado.</p>'}<p class="tiny">A revogação bloqueia as próximas consultas. Informações já visualizadas ou exportadas pelo consultor não podem ser recolhidas.</p>`;
 if(!dialog.open)dialog.showModal();
 dialog.querySelector('#close-access').onclick=()=>dialog.close();
 dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();event.stopPropagation();const button=event.currentTarget.querySelector('button');button.disabled=true;try{await request('access-grant',{email:event.currentTarget.elements.email.value});await accessDialog();}catch(error){dialog.querySelector('#access-error').textContent=error.message;button.disabled=false;}});
 dialog.querySelectorAll('[data-revoke]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await request('access-revoke',{id:button.dataset.revoke});await accessDialog();}catch(error){dialog.querySelector('#access-error').textContent=error.message;button.disabled=false;}});
}
async function chooseWorkspace(){
 const available=await request('workspaces');
 if(!loaded&&available.own&&!available.shared.length){workspaceId=available.own.id;return loadApp();}
 lastState=null;workspaceId='';window.norte.clearPrivateData?.();
 document.querySelector('#app').innerHTML=`<div class="auth-shell"><div class="auth-intro"><div class="eyebrow">NORTE</div><h1>Suas contas autorizadas.</h1><p>O acesso de consultoria depende da autorização do responsável.</p></div><section class="auth-card"><h2>Selecionar conta</h2>${available.own?`<button type="button" class="primary" data-workspace="${escape(available.own.id)}">Minha conta · responsável</button>`:''}${available.shared.map((entry,index)=>`<div class="bank-item"><h3>Conta compartilhada ${index+1}</h3><p>Permissão de leitura</p><button type="button" data-workspace="${escape(entry.workspaceId)}" ${!entry.accepted?`data-accept="${escape(entry.id)}"`:''}>${entry.accepted?'Abrir conta':'Aceitar e abrir'}</button></div>`).join('')}${!available.own&&!available.shared.length?'<p>Nenhuma conta autorizada para este e-mail. Solicite acesso ao responsável.</p>':''}<button type="button" id="account-logout">Sair</button><p id="workspace-error" role="alert"></p></section></div>`;
 document.querySelector('#account-logout').onclick=async()=>{await client.auth.signOut();location.reload();};
 document.querySelectorAll('[data-workspace]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{if(button.dataset.accept)await request('access-accept',{id:button.dataset.accept});workspaceId=button.dataset.workspace;await loadApp();}catch(error){document.querySelector('#workspace-error').textContent=error.message;button.disabled=false;}});
}
async function loadApp(){if(loaded){await window.norte.refresh();return;}loaded=true;const script=document.createElement('script');script.src='app.js';document.body.append(script);}
setInterval(()=>{if(loaded&&workspaceId&&document.visibilityState==='visible')request('access-check').catch(error=>message(error.message,true));},60000);

// Category creation in bank review uses the same inline dialog as all other category fields.
document.addEventListener('change',event=>{
 const row=event.target.closest('[data-bank-key]');if(!row)return;
 if(event.target.matches('[data-bank-type]')){const type=event.target.value==='estorno'?'despesa':event.target.value;const select=row.querySelector('[data-bank-category]');for(const option of select.options)option.hidden=Boolean(option.dataset.type&&option.dataset.type!==type);select.value='';select.disabled=type==='transferencia';}
 if(event.target.matches('[data-bank-category]')&&event.target.value==='__new_category__'){
  event.target.value='';window.norte.createBankCategory?.(row);
 }
});
function authScreen(mode='login'){
 const recovery=mode==='recovery',signup=mode==='signup',reset=mode==='reset';
 document.querySelector('#app').innerHTML=`<div class="auth-shell"><div class="auth-intro"><div class="eyebrow">NORTE · FINANÇAS PESSOAIS</div><h1>Seu dinheiro.<br>Uma direção.</h1><p>Planeje o mês, acompanhe suas conquistas e veja suas finanças em um só lugar.</p></div><section class="auth-card"><h2>${recovery?'Defina sua nova senha':signup?'Crie seu acesso':reset?'Recuperar acesso':'Entre no seu Norte'}</h2><p class="tiny">Acesso pessoal. Seus registros ficam privados.</p><form id="auth-form">${!recovery?'<div class="field"><label for="auth-email">E-mail</label><input id="auth-email" type="email" name="email" autocomplete="email" required></div>':''}${!reset?`<div class="field"><label for="auth-password">Senha</label><input id="auth-password" type="password" name="password" minlength="${recovery||signup?10:1}" autocomplete="${recovery||signup?'new-password':'current-password'}" required></div>`:''}<div id="auth-error" role="alert"></div><button class="primary" type="submit">${recovery?'Salvar nova senha':signup?'Criar acesso':reset?'Enviar link':'Entrar'}</button></form>${!recovery?`<button class="auth-switch flat" id="auth-switch">${signup||reset?'Já tenho acesso':'Criar meu acesso'}</button>${!signup&&!reset?'<button class="auth-switch flat" id="auth-reset">Esqueci minha senha</button>':''}`:''}</section></div>`;
 document.querySelector('#auth-switch')?.addEventListener('click',()=>authScreen(signup||reset?'login':'signup'));
 document.querySelector('#auth-reset')?.addEventListener('click',()=>authScreen('reset'));
 document.querySelector('#auth-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;
  try{
   const email=form.elements.email?.value.trim(),password=form.elements.password?.value;const redirectTo=new URL('./',location.href).href;
   const result=recovery?await client.auth.updateUser({password}):reset?await client.auth.resetPasswordForEmail(email,{redirectTo}):signup?await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}}):await client.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(reset||signup&&!result.data?.session){document.querySelector('#auth-error').textContent=reset?'Se o e-mail estiver cadastrado, você receberá um link de recuperação.':'Confira seu e-mail para confirmar o acesso.';return;}
   recovering=false;history.replaceState(null,'',location.pathname);await startApp();
  }catch(error){document.querySelector('#auth-error').textContent=error.message;}finally{button.disabled=false;}
 });
}
async function startApp(){await chooseWorkspace();}
async function boot(){
 if(!config.url||!config.key){document.querySelector('#app').innerHTML='<div class="auth-shell"><div class="auth-intro"><div class="eyebrow">NORTE</div><h1>Quase pronto.</h1><p>O site foi publicado. Falta conectar o projeto Supabase para ativar seu acesso e armazenamento.</p></div><section class="auth-card"><h2>Configuração pendente</h2><p>Configure as variáveis públicas do projeto no GitHub e publique novamente, seguindo o guia de implantação do repositório.</p><p>Nenhum dado financeiro foi carregado.</p></section></div>';return;}
 // Authentication and financial data stay in memory, not persistent browser storage.
 try{localStorage.removeItem('sb-'+new URL(config.url).hostname.split('.')[0]+'-auth-token');}catch{}
 client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:true}});
 client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recovering=true;authScreen('recovery');}if(event==='SIGNED_OUT'&&loaded)location.reload();});
 const {data:{session}}=await client.auth.getSession();
 if(recovering)authScreen('recovery');else if(session)await startApp();else authScreen();
}
boot().catch(error=>{document.querySelector('#app').textContent='Não foi possível abrir o Norte: '+error.message;});
