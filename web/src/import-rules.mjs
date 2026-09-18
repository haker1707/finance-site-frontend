import {installmentInfo} from './intelligence.mjs';
export const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const words=(s,q)=>(' '+norm(s)+' ').includes(' '+norm(q)+' ');
const nat=r=>r.reversal?'estorno':r.type||'';
const bank=r=>norm(r.bank||r.csvIdentity?.bank||(r.source==='CSV Nubank'?'Nubank':r.source?.startsWith('CSV · ')?r.source.slice(6):''));
const scope=r=>r._scope??(r.cardId?'card:'+r.cardId:'account:'+norm(r.account));
const sign=r=>Number.isFinite(r.signed)?Math.sign(r.signed):Number.isFinite(r.csvOriginal?.signed)?Math.sign(r.csvOriginal.signed):null;
const source=r=>r.csvIdentity||r.identity||{};
export function inferNature(row,rules=[],history=[]){
 const s=norm(row.description),credit=Boolean(row.cardId),convention=row.signConvention||source(row).signConvention||'manual';
 const creditValue=convention==='negative-credit'?row.signed<0:convention==='positive-credit'?row.signed>0:null;
 const refund=/\b(estorno|reembolso|devolucao|cancelamento)\b/.test(s);
 const payment=/\bpagamento (?:de |da |do )?(?:fatura|recebido|antecipado|efetuado)\b|\badiantamento (?:de |da )?fatura\b/.test(s);
 const paymentConflict=refund&&/\b(pagamento|fatura|adiantamento)\b/.test(s);
 let type='',suggestedType='',reason='Escolha a natureza desta movimentação.',code='unknown',needsConfirmation=true;
 if(!credit){
  // Account statement signs indicate cash direction, not a credit-card refund.
  if(convention!=='manual'&&Number.isFinite(row.signed)&&row.signed!==0){const incoming=creditValue;
   if(payment&&!refund&&incoming===false){type='fatura';reason='Descrição de pagamento de fatura e saída da conta.';code='payment';needsConfirmation=false;}
   else if(!/\bpix\b|\btransferencia\b/.test(s)&&incoming===false&&!refund){type='despesa';reason='Saída da conta conforme a convenção informada.';code='expense';needsConfirmation=false;}
   else if(incoming&&/\bsalario\b/.test(s)&&!refund){type='receita';reason='Crédito identificado como salário.';code='income';needsConfirmation=false;}
  }
 }else if(!row.issues?.length&&Number.isFinite(row.signed)&&row.signed!==0){
  if(paymentConflict||refund&&payment){reason='A descrição mistura estorno e pagamento. Confirme o efeito desta movimentação.';code='conflict';}
  else if(convention==='manual'){reason='A convenção de sinais não foi definida. Escolha a natureza.';code='sign-unknown';suggestedType=payment?'fatura':refund?'estorno':'';}
  else if((payment||refund)&&!creditValue){reason='A descrição e o sinal indicam efeitos diferentes. Confirme a natureza.';code='conflict';suggestedType=payment?'fatura':'estorno';}
  else if(payment){type='fatura';reason='Descrição explícita de pagamento/adiantamento da fatura.';code='payment';needsConfirmation=false;}
  else if(refund){type='estorno';reason='Descrição explícita de estorno, reembolso ou devolução.';code='refund';needsConfirmation=false;}
  else if(creditValue){suggestedType=s?'estorno':'';reason='Crédito sem indicação de pagamento: possível estorno, ainda não confirmado.';code='possible-refund';}
  else{type='despesa';reason='Cobrança conforme a convenção de sinais deste arquivo.';code='expense';needsConfirmation=false;}
 }
 const matches=rules.filter(r=>r.bank===bank(row)&&r.format===row.format&&r.credit===credit&&r.signConvention===convention&&words(row.description,r.expression)).sort((a,b)=>b.expression.length-a.expression.length||a.id.localeCompare(b.id));
 const personal=matches[0];
 if(personal){if(new Set(matches.map(r=>r.type)).size>1||code==='conflict'||type&&type!==personal.type){type=personal.type;needsConfirmation=true;reason='Regra pessoal conflita com outra evidência. Confirme a natureza.';code='personal-conflict';}else{type=personal.type;needsConfirmation=convention==='manual'||Boolean(row.issues?.length);reason='Regra pessoal para este banco, formato e expressão.';code='personal';}}
 let evidence=0;
 if(credit&&(type==='estorno'||suggestedType==='estorno')){const base=norm(row.description).replace(/\b(estorno|reembolso|devolucao|cancelamento|de|da|do)\b/g,' ').replace(/\s+/g,' ').trim();if(base.length>=4)evidence=history.filter(r=>r.kind==='entry'&&r.cardId===row.cardId&&r.type==='despesa'&&!r.reversal&&r.date<=row.date&&r.amount>=row.amount&&norm(r.description).replace(/\b(de|da|do)\b/g,' ').replace(/\s+/g,' ').trim()===base).length;}
 return {type,suggestedType,reason,code,needsConfirmation,evidence,ruleId:personal?.id||''};
}
export const natureToken=(row,type,hint)=>JSON.stringify([row.identity?.fileRowKey||row.key,row.date,row.description,row.amount,row.signed,row.signConvention,type,hint.code,hint.ruleId]);
export function natureLabel(row,choice,hint){if(choice?.natureConfirmed)return 'Natureza confirmada';if(hint.needsConfirmation)return row.cardId?'Confirmar tipo de crédito':'Confirmar natureza';return hint.type==='estorno'?'Estorno identificado':hint.type==='fatura'?'Pagamento identificado':'Natureza identificada';}
export function validateNatureRule(r){
 if(!r||typeof r.id!=='string'||!r.id||r.id.length>200||typeof r.bank!=='string'||!r.bank||r.bank.length>80||!['nubank-credit','nubank-account','mapped'].includes(r.format)||typeof r.credit!=='boolean'||!['negative-credit','positive-credit','manual'].includes(r.signConvention)||typeof r.expression!=='string'||norm(r.expression).length<6||norm(r.expression).length>120||norm(r.expression).split(' ').length<2||!['despesa','receita','transferencia','fatura','estorno','investimento','divida','saldo'].includes(r.type)||r.credit&&!['despesa','fatura','estorno'].includes(r.type))throw Error('Regra de natureza inválida. Use uma expressão específica de 6 a 120 caracteres e pelo menos duas palavras.');
 return {...r,bank:norm(r.bank),expression:norm(r.expression)};
}
export function validateNatureRules(rules=[]){if(!Array.isArray(rules)||rules.length>1000)throw Error('Limite de 1.000 regras pessoais de natureza.');const seen=new Set();for(const r of rules){validateNatureRule(r);if(seen.has(r.id))throw Error('Regra repetida.');seen.add(r.id);}return rules;}
export function natureRuleAction(data,action,p){data.natureRules??=[];if(action==='nature-rule-remove'){if(typeof p.id!=='string')throw Error('Regra inválida.');data.natureRules=data.natureRules.filter(r=>r.id!==p.id);return true;}if(action!=='nature-rule-save')throw Error('Ação inválida.');if(p.confirm!==true)throw Error('Confirme a regra pessoal.');const rule=validateNatureRule({...p.rule,id:p.rule?.id||crypto.randomUUID()});if(p.rule?.id&&!data.natureRules.some(r=>r.id===rule.id))throw Error('Regra inexistente.');const same=r=>r.bank===rule.bank&&r.format===rule.format&&r.credit===rule.credit&&r.signConvention===rule.signConvention&&r.expression===rule.expression;const existing=data.natureRules.find(same);if(existing&&existing.id!==rule.id&&existing.type===rule.type)return true;if(existing&&existing.id!==rule.id)throw Error('Já existe uma regra para esta expressão. Edite a regra existente.');const next=data.natureRules.filter(r=>r.id!==rule.id).concat(rule);validateNatureRules(next);data.natureRules=next;return true;}
const rowNature=r=>nat(r)||'';
const part=r=>{const p=installmentInfo(r.description);return p?`${p.number}/${p.total}`:'';};
const description=r=>r._description??norm(installmentInfo(r.description)?.base||String(r.description||'').replace(/\s*·\s*1\/1\s*$/,''));
const facts=r=>[r.date,r.description,r.amount,rowNature(r),sign(r),r.invoicePeriod||'',scope(r),bank(r),part(r),r.signConvention||source(r).signConvention||''];
const uid=r=>r._batch?`batch:${r.fileIndex}:${r.originalIndex}`:`saved:${r.id}`;
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function editedImportRow(row,choice){return {...row,date:choice.date,description:choice.description,amount:choice.amount,type:choice.type,reversal:choice.type==='estorno',_batch:true};}
export function duplicateIndex(records,ledger,imports=[]){
 const saved=ledger.map(r=>({...r,date:r.originalDate||r.date,amount:Math.abs(r.amount),_batch:false}));return {saved,imports};
}
function sameScope(a,b){return scope(a)===scope(b)&&(!bank(a)||!bank(b)||bank(a)===bank(b));}
function exactReason(a,b,imports){
 if(!sameScope(a,b))return '';
 const x=source(a),y=source(b);
 if(x.providerKey&&x.providerKey===y.providerKey)return 'Mesmo identificador do banco na mesma conta/cartão.';
 if(x.fileRowKey&&x.fileRowKey===y.fileRowKey)return 'Mesma linha do mesmo arquivo original na mesma conta/cartão.';
 // Legacy provider identifiers are reliable only when bank and account are known.
 if(x.providerKey&&!y.version&&b.source==='CSV Nubank'&&bank(a)&&bank(a)===bank(b)&&a.providerId&&a.providerId===b.csvOriginal?.providerId)return 'Mesmo identificador bancário de um lançamento anterior.';
 if(!b._batch&&!y.version&&a.key===b.csvKey&&a.identity?.fileHash&&imports.some(i=>i.hash===a.identity.fileHash&&(i.cardId||'')===(a.cardId||'')&&(a.cardId?i.period===a.invoicePeriod:norm(i.account)===norm(a.account))))return 'Arquivo já importado: identidade histórica e destino coincidem.';
 return '';
}
function possibleReason(a,b){
 if(!sameScope(a,b)||a.amount!==b.amount||!a.amount||description(a)!==description(b)||!description(a))return '';
 const na=rowNature(a),nb=rowNature(b);if(na&&nb&&na!==nb)return '';
 if(part(a)!==part(b))return '';
 const sa=sign(a),sb=sign(b),ca=a.signConvention||source(a).signConvention,cb=b.signConvention||source(b).signConvention;
 if(sa!==null&&sb!==null&&sa!==sb&&(!ca||!cb||ca===cb))return '';
 if(a.cardId){if(a.date!==b.date&&(!a.invoicePeriod||a.invoicePeriod!==b.invoicePeriod))return '';}
 else if(a.date!==b.date)return '';
 return 'Mesma conta/cartão, descrição, valor e data ou mês da fatura; natureza e parcela compatíveis. Sem identidade suficiente para provar repetição.';
}
// Compare the entire batch before any writes; file order never decides a possible match.
export async function analyzeDuplicates(rows,index){
 const all=[...index.saved,...rows].map(r=>({...r,_scope:scope(r),_description:description(r)})),buckets=new Map(),providers=new Map(),files=new Map(),legacy=new Map(),legacyProviders=new Map();
 const add=(map,key,r)=>{if(!key)return;const a=map.get(key)||[];a.push(r);map.set(key,a);};
 for(const r of all){add(buckets,scope(r)+'|'+r.amount+'|'+description(r),r);add(providers,source(r).providerKey,r);add(files,source(r).fileRowKey,r);if(r.csvKey)add(legacy,r.csvKey,r);const provider=r.providerId||r.csvOriginal?.providerId;if(provider&&bank(r))add(legacyProviders,scope(r)+'|'+bank(r)+'|'+provider,r);}
 const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
 const stamps=new Map();
 const groupStamp=group=>{if(!group?.length)return Promise.resolve('');if(!stamps.has(group))stamps.set(group,hash(JSON.stringify(group.map(r=>[uid(r),facts(r)]).sort((a,b)=>compare(a[0],b[0])))));return stamps.get(group);};
 const rank=r=>JSON.stringify([r.fileName||'',source(r).fileHash||'',r.originalIndex??-1,r.fileIndex??-1]);
 return Promise.all(rows.map(async row=>{
  const groups=[buckets.get(scope(row)+'|'+row.amount+'|'+description(row)),providers.get(source(row).providerKey),files.get(source(row).fileRowKey),legacy.get(row.key),source(row).providerKey?legacyProviders.get(scope(row)+'|'+bank(row)+'|'+row.providerId):null].filter(Boolean);
  const pool=new Map();for(const group of groups)for(const r of group)if(uid(r)!==uid(row))pool.set(uid(r),r);
  const blockers=[],possible=[];let blockerCount=0,possibleCount=0;
  for(const r of [...pool.values()].sort((a,b)=>compare(uid(a),uid(b)))){const exact=exactReason(row,r,index.imports),reason=exact||possibleReason(row,r);if(!reason)continue;
   if(exact){if(!r._batch||compare(rank(r),rank(row))<0){blockerCount++;if(blockers.length<20)blockers.push({row:r,exact:true,reason});}}
   else{possibleCount++;if(possible.length<20)possible.push({row:r,exact:false,reason});}
  }
  const exact=blockerCount>0,candidates=exact?blockers:possible,versions=await Promise.all(groups.map(groupStamp));
  return {exact,possible:!exact&&possibleCount>0,candidates,candidateCount:exact?blockerCount:possibleCount,reason:candidates[0]?.reason||'',signature:JSON.stringify([facts(row),versions])};
 }));
}
