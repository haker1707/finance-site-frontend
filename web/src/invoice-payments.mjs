// Settlement metadata never creates financial ledger entries.
const list=(d,k)=>d[k]||[];
const periodOK=p=>typeof p==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(p);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function invoiceFingerprint(d,cardId,period,F){return JSON.stringify(F.ledger(d.records).filter(r=>r.cardId===cardId&&r.type!=='fatura'&&r.date.slice(0,7)===period).map(r=>[r.id,r.date,r.amount,r.type,r.description]).sort((a,b)=>a[0].localeCompare(b[0])));}
export function purchaseFingerprint(p){return JSON.stringify([p.id,p.cardId,p.amount,p.count,p.currentInstallment??1,p.firstDue,p.dueDay,p.schedule||null]);}
export function explicitInvoicePeriod(r){const s=norm(r.description);if(/estorno|devolucao|reembolso/.test(s))return '';const matches=[...s.matchAll(/fatura\s*(?:de\s*|referente\s*a\s*|ref\.?\s*)?(0?[1-9]|1[0-2])[\/-](20\d{2})\b/g)];return matches.length===1?`${matches[0][2]}-${matches[0][1].padStart(2,'0')}`:'';}
export function invoiceState(d,cardId,period,F){
 const config=list(d,'invoiceStatements').find(s=>s.cardId===cardId&&s.period===period);
 let fresh=!!config&&config.fingerprint===invoiceFingerprint(d,cardId,period,F);
 const linked=list(d,'invoicePayments').filter(p=>p.cardId===cardId&&p.period===period);
 const used=new Set(list(d,'invoicePayments').map(p=>p.entryId).filter(Boolean));
 const payments=linked.map(p=>{if(!p.entryId)return {...p,origin:'manual'};const r=d.records.find(r=>r.id===p.entryId&&r.kind==='entry'&&r.type==='fatura'&&r.cardId===cardId);return r?{...p,amount:r.amount,date:r.date,origin:'linked'}:null;}).filter(Boolean);
 if(payments.length!==linked.length)fresh=false;
 // CSV invoicePeriod is NOT a payment's target invoice. Require an explicit description reference.
 if(fresh&&config.auto&& !payments.some(p=>p.origin==='manual'))for(const r of d.records){
  if(r.kind==='entry'&&r.type==='fatura'&&r.cardId===cardId&&r.csvIdentity&&r.csvOriginal&&explicitInvoicePeriod(r)===period&&!used.has(r.id)&&r.amount>0&&r.date<=new Date().toISOString().slice(0,10)&&!list(d,'invoiceAutoIgnored').includes(r.id))payments.push({id:'auto:'+r.id,entryId:r.id,amount:r.amount,date:r.date,origin:'auto'});
 }
 const paid=payments.reduce((s,p)=>s+p.amount,0),remaining=fresh?Math.max(0,config.total-paid):null;
 return {config,fresh,payments,paid,remaining,settled:fresh&&paid>=config.total,stale:!!config&&!fresh};
}
export function installmentStatus(invoice,due,today,{historical=false,paidHistory=false,estimated=false}={}){
 if(paidHistory||(!historical&&!estimated&&invoice.settled))return {code:'paid',label:'Paga'};
 if(historical)return {code:'unknown',label:'Sem confirmação'};
 if(!due)return {code:'unknown',label:'Vencimento não informado'};
 if(due<today)return invoice.fresh&&invoice.config.outstandingConfirmed&&invoice.remaining>0?{code:'overdue',label:'Atrasada'}:{code:'unknown',label:'Pagamento não confirmado'};
 return due.slice(0,7)===today.slice(0,7)?{code:'current',label:'Atual'}:{code:'future',label:'Futura'};
}
export function validateInvoices(d,F){
 for(const key of ['invoiceStatements','invoicePayments','purchaseHistory','invoiceAutoIgnored'])if(d[key]!==undefined&&(!Array.isArray(d[key])||d[key].length>30000))throw Error('Histórico de pagamentos inválido.');
 const seen=new Set(),entries=new Set();
 for(const s of list(d,'invoiceStatements')){const key=s.cardId+'|'+s.period;if(seen.has(key)||!d.records.some(r=>r.kind==='card'&&r.id===s.cardId)||!periodOK(s.period)||!F.validDate(s.due)||s.due.slice(0,7)!==s.period||typeof s.fingerprint!=='string'||s.fingerprint.length>3000000||typeof s.auto!=='boolean'||typeof s.outstandingConfirmed!=='boolean')throw Error('Fatura inválida.');F.integer(s.total,0);seen.add(key);}
 seen.clear();for(const p of list(d,'invoicePayments')){if(typeof p.id!=='string'||seen.has(p.id)||!d.records.some(r=>r.kind==='card'&&r.id===p.cardId)||!periodOK(p.period)||!F.validDate(p.date))throw Error('Pagamento de fatura inválido.');F.integer(p.amount,1);if(p.entryId){if(typeof p.entryId!=='string'||entries.has(p.entryId))throw Error('O pagamento já está vinculado a outra fatura.');entries.add(p.entryId);}seen.add(p.id);}
 seen.clear();for(const h of list(d,'purchaseHistory')){if(typeof h.purchaseId!=='string'||seen.has(h.purchaseId)||typeof h.fingerprint!=='string'||h.fingerprint.length>100000||!Array.isArray(h.numbers)||h.numbers.length>600||h.numbers.some(n=>!Number.isInteger(n)||n<1||n>600)||typeof h.confirmedAt!=='string')throw Error('Confirmação histórica inválida.');seen.add(h.purchaseId);}
 if(list(d,'invoiceAutoIgnored').some(id=>typeof id!=='string'||id.length>200))throw Error('Identificação de pagamento inválida.');
}
export function invoiceAction(d,action,p,F){
 const now=new Date().toISOString();
 if(p.confirm!==true)throw Error('Confirme a alteração do pagamento.');
 if(action==='purchase-history'){
  const purchase=d.records.find(r=>r.kind==='purchase'&&r.id===p.purchaseId);if(!purchase||purchase.schedule)throw Error('Compra manual não encontrada.');
  const numbers=p.paid===false?[]:Array.from({length:(purchase.currentInstallment??1)-1},(_,i)=>i+1);
  d.purchaseHistory=list(d,'purchaseHistory').filter(h=>h.purchaseId!==purchase.id);if(numbers.length)d.purchaseHistory.push({purchaseId:purchase.id,numbers,fingerprint:purchaseFingerprint(purchase),confirmedAt:now});
 }else{
  const card=d.records.find(r=>r.kind==='card'&&r.id===p.cardId);if(!card||!periodOK(p.period))throw Error('Selecione o cartão e o mês da fatura.');
  if(action==='invoice-statement'){
   F.integer(p.total,0);if(!F.validDate(p.due)||p.due.slice(0,7)!==p.period)throw Error('Informe o vencimento no mês da fatura.');
   if(p.complete!==true)throw Error('Confirme que o total informado é o total completo da fatura.');
   if((d.installmentPending||[]).some(x=>d.records.some(r=>r.id===x.entryId&&r.cardId===p.cardId&&(r.invoicePeriod||r.date.slice(0,7))===p.period)))throw Error('Resolva os vínculos ambíguos desta fatura antes de confirmar o total.');
   d.invoiceStatements=list(d,'invoiceStatements').filter(s=>s.cardId!==p.cardId||s.period!==p.period);
   d.invoiceStatements.push({cardId:p.cardId,period:p.period,total:p.total,due:p.due,auto:p.auto===true,outstandingConfirmed:p.outstandingConfirmed===true,fingerprint:invoiceFingerprint(d,p.cardId,p.period,F),confirmedAt:now});
  }else if(action==='invoice-payment'){
   let amount=p.amount,date=p.date;let entry;
   if(p.entryId){entry=d.records.find(r=>r.id===p.entryId&&r.kind==='entry'&&r.type==='fatura'&&r.cardId===p.cardId);if(!entry)throw Error('Pagamento importado não encontrado neste cartão.');if(list(d,'invoicePayments').some(x=>x.entryId===entry.id))throw Error('Este pagamento já foi vinculado.');amount=entry.amount;date=entry.date;}
   F.integer(amount,1);if(!F.validDate(date)||date>now.slice(0,10))throw Error('Informe uma data de pagamento válida, não futura.');
   const existing=invoiceState(d,p.cardId,p.period,F);if(list(d,'invoicePayments').some(x=>x.cardId===p.cardId&&x.amount===amount&&x.date===date))throw Error('Há uma confirmação com o mesmo valor e data neste cartão. Revise-a antes de registrar outro pagamento.');if(!entry&&existing.payments.some(x=>x.origin==='auto'))throw Error('Revise os pagamentos conciliados antes de adicionar um pagamento manual.');
   if(!entry&&d.records.some(r=>r.kind==='entry'&&r.type==='fatura'&&r.cardId===p.cardId&&r.amount===amount&&r.date===date))throw Error('Já existe um pagamento com esse valor e data. Vincule a movimentação existente.');
   d.invoicePayments=list(d,'invoicePayments');d.invoicePayments.push({id:crypto.randomUUID(),cardId:p.cardId,period:p.period,amount,date,...(entry?{entryId:entry.id}:{}),confirmedAt:now});
  }else if(action==='invoice-payment-remove'){
   const statement=list(d,'invoiceStatements').find(s=>s.cardId===p.cardId&&s.period===p.period);if(statement)statement.outstandingConfirmed=false;
   if(String(p.id).startsWith('auto:')){const entryId=p.id.slice(5);if(!invoiceState(d,p.cardId,p.period,F).payments.some(x=>x.id===p.id))throw Error('Pagamento não encontrado.');d.invoiceAutoIgnored=[...new Set([...list(d,'invoiceAutoIgnored'),entryId])];}
   else {if(!list(d,'invoicePayments').some(x=>x.id===p.id&&x.cardId===p.cardId&&x.period===p.period))throw Error('Pagamento não encontrado.');const old=list(d,'invoicePayments').find(x=>x.id===p.id);if(old.entryId)d.invoiceAutoIgnored=[...new Set([...list(d,'invoiceAutoIgnored'),old.entryId])];d.invoicePayments=list(d,'invoicePayments').filter(x=>x.id!==p.id);}
  }else throw Error('Ação de pagamento indisponível.');
 }
 validateInvoices(d,F);return true;
}
