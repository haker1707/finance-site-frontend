// Shared categorization and installment rules. No I/O and no financial writes.
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const validMonth=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s||'')&&+s.slice(0,4)>=1900&&+s.slice(0,4)<=2200;
export function monthOffset(period,offset){if(!validMonth(period))throw Error('Mês inválido.');const d=new Date(Date.UTC(+period.slice(0,4),+period.slice(5)-1+offset,1)),out=d.toISOString().slice(0,7);if(!validMonth(out))throw Error('Projeção fora do intervalo de datas.');return out;}
export function installmentInfo(description){
 const text=String(description||''),matches=[...text.matchAll(/(?:\bparcela\s*)?(\d{1,3})\s*(?:\/|\bde\b)\s*(\d{1,3})(?!\d)/gi)];
 if(matches.length!==1)return null;const m=matches[0],number=+m[1],total=+m[2];
 // Without the word Parcela, accept only a terminal x/y marker, never date fragments.
 if(!/parcela/i.test(m[0])&&(!/\//.test(m[0])||text.slice(m.index+m[0].length).trim()||/[\d/.-]$/.test(text.slice(0,m.index))))return null;
 if(number<1||total<2||number>total||total>120)return null;
 const base=(text.slice(0,m.index)+text.slice(m.index+m[0].length)).replace(/[\s·–—-]+$/,'').trim();if(!base)return null;
 return {number,total,base,key:norm(base)};
}
export function merchantName(description){
 const base=installmentInfo(description)?.base||String(description||'').trim(),s=norm(base);
 if(/\bmercado\s*pago\b|\bmercadopago\b/.test(s))return 'Mercado Pago';
 if(/\bmercado\s*livre\b|\bmercadolivre\b/.test(s))return 'Mercado Livre';
 const known=[['spotify','Spotify'],['netflix','Netflix'],['amazon prime','Amazon Prime'],['disney','Disney+'],['youtube','YouTube'],['icloud','iCloud'],['google one','Google One'],['chatgpt','ChatGPT'],['chatgp','ChatGPT'],['openai','OpenAI'],['ifood club','iFood Clube']];
 return known.find(([key])=>s.includes(key))?.[1]||base.slice(0,200);
}
export const categoryKey=description=>norm(merchantName(description));
export function categoryHint(row,records,rules=[]){
 const type=row.type==='estorno'?'despesa':row.type,rule=rules.find(r=>r.key===categoryKey(row.description)&&r.type===type),cat=rule&&records.find(c=>c.kind==='category'&&!c.archived&&c.id===rule.categoryId&&c.type===type);
 if(cat)return {categoryId:cat.id,categoryName:cat.name,ruleApplied:true};
 return null;
}
export function installmentEligible(r){return r.kind==='entry'&&r.cardId&&r.type==='despesa'&&!r.reversal&&validMonth(r.invoicePeriod)&&Boolean(installmentInfo(r.description));}
export const installmentAutoReview=r=>Boolean(installmentEligible(r));
export const needsReview=r=>r.reviewStatus==='pending'&&!installmentAutoReview(r);
export function expectedPart(plan,number){const edit=plan.overrides?.[number]||{};return {number,period:edit.period||monthOffset(plan.anchorPeriod,number-plan.anchorNumber),amount:edit.amount??plan.amount,cancelled:Boolean(plan.cancelled||edit.cancelled)};}
export function syncInstallments(data){
 data.installmentPlans??=[];data.installmentIgnored??=[];
 const records=data.records||[],entries=records.filter(installmentEligible).sort((a,b)=>a.invoicePeriod.localeCompare(b.invoicePeriod)||installmentInfo(a.description).number-installmentInfo(b.description).number||a.id.localeCompare(b.id)),byId=new Map(entries.map(r=>[r.id,r])),assigned=new Set(),pending=[];
 for(const plan of data.installmentPlans){plan.confirmed??={};for(const [number,id]of Object.entries(plan.confirmed)){const r=byId.get(id),info=r&&installmentInfo(r.description);if(!r||r.cardId!==plan.cardId||info.total!==plan.total||info.number!==Number(number)||assigned.has(id))delete plan.confirmed[number];else assigned.add(id);}plan.orphaned=!Object.keys(plan.confirmed).length;}
 for(const r of entries){if(assigned.has(r.id)||data.installmentIgnored.includes(r.id))continue;const info=installmentInfo(r.description);try{monthOffset(r.invoicePeriod,info.total-info.number);}catch{continue;}const candidates=data.installmentPlans.filter(p=>!p.orphaned&&p.cardId===r.cardId&&p.total===info.total&&p.key===info.key);
  const exact=candidates.filter(p=>{const expected=expectedPart(p,info.number);return !p.confirmed[info.number]&&expected.period===r.invoicePeriod&&expected.amount===r.amount;});
  if(candidates.length===1&&exact.length===1){exact[0].confirmed[info.number]=r.id;assigned.add(r.id);continue;}
  if(candidates.length){pending.push({entryId:r.id,candidates:candidates.filter(p=>!p.confirmed[info.number]).map(p=>p.id),reason:'Confira valor, mês e compra: a correspondência não é única ou diverge da previsão.'});continue;}
  let id='ip-'+r.id;while(data.installmentPlans.some(p=>p.id===id))id+='x';data.installmentPlans.push({id,cardId:r.cardId,key:info.key,name:info.base,merchant:merchantName(r.description),total:info.total,anchorNumber:info.number,anchorPeriod:r.invoicePeriod,amount:r.amount,purchaseDate:r.date,confirmed:{[info.number]:r.id},overrides:{},cancelled:false,orphaned:false});assigned.add(r.id);
 }
 data.installmentPending=pending;
 return data;
}
export function installmentEstimates(plans,records){
 const byId=new Map(records.map(r=>[r.id,r])),result=[];
 for(const plan of plans||[]){if(plan.orphaned||plan.cancelled)continue;for(let number=plan.anchorNumber+1;number<=plan.total;number++){if(byId.has(plan.confirmed?.[number]))continue;const part=expectedPart(plan,number);if(!part.cancelled){const card=byId.get(plan.cardId),due=card?.due,day=due?Math.min(due,new Date(Date.UTC(+part.period.slice(0,4),+part.period.slice(5),0)).getUTCDate()):0;result.push({...part,dueDate:day?part.period+'-'+String(day).padStart(2,'0'):'',planId:plan.id,cardId:plan.cardId,name:plan.name,merchant:plan.merchant,total:plan.total});}}}
 return result;
}
export function validateIntelligence(data){
 const records=data.records||[],rules=data.categoryRules||[],plans=data.installmentPlans||[],ignored=data.installmentIgnored||[];
 if(!Array.isArray(rules)||rules.length>3000||!Array.isArray(plans)||plans.length>10000||!Array.isArray(ignored)||ignored.length>30000)throw Error('Regras ou previsões inválidas.');
 const ruleKeys=new Set(),ids=new Set();
 for(const r of rules){const cat=records.find(c=>c.kind==='category'&&c.id===r.categoryId&&c.type===r.type);if(!cat||typeof r.key!=='string'||!r.key||r.key.length>2000||ruleKeys.has(r.type+'|'+r.key))throw Error('Regra de categoria inválida.');ruleKeys.add(r.type+'|'+r.key);}
 for(const p of plans){if(!p||typeof p.id!=='string'||p.id.length>230||ids.has(p.id)||typeof p.name!=='string'||p.name.length>2000||typeof p.key!=='string'||p.key.length>2000||typeof p.merchant!=='string'||p.merchant.length>200||!records.some(r=>r.kind==='card'&&r.id===p.cardId)||!Number.isInteger(p.total)||p.total<2||p.total>120||!Number.isInteger(p.anchorNumber)||p.anchorNumber<1||p.anchorNumber>p.total||!validMonth(p.anchorPeriod)||!Number.isSafeInteger(p.amount)||p.amount<1||p.amount>900000000000||!p.confirmed||Array.isArray(p.confirmed)||typeof p.confirmed!=='object'||!p.overrides||Array.isArray(p.overrides)||typeof p.overrides!=='object')throw Error('Plano de parcelas inválido.');ids.add(p.id);monthOffset(p.anchorPeriod,p.total-p.anchorNumber);
  for(const [n,id]of Object.entries(p.confirmed)){const r=records.find(x=>x.id===id),info=r&&installmentInfo(r.description);if(!installmentEligible(r||{})||r.cardId!==p.cardId||!info||info.number!==Number(n)||info.total!==p.total)throw Error('Cobrança vinculada inválida.');}
  for(const [n,x]of Object.entries(p.overrides)){if(!Number.isInteger(Number(n))||+n<=p.anchorNumber||+n>p.total||!validMonth(x.period)||!Number.isSafeInteger(x.amount)||x.amount<1||x.amount>900000000000||typeof x.cancelled!=='boolean')throw Error('Previsão ajustada inválida.');}
 }
 if(ignored.some(id=>typeof id!=='string'||id.length>200))throw Error('Lista de parcelas ignoradas inválida.');
}
