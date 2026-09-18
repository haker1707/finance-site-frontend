import {catalogMatch,catalogNormalize} from './catalog.mjs';
import {installmentInfo,categoryHint,merchantName} from './intelligence.mjs';
// Pure rules shared by the browser preview and the authenticated server.
export const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value&&+value.slice(0,4)>=1900&&+value.slice(0,4)<=2200;
export function cents(value,decimal='auto'){
 let s=String(value??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().replace(/\u2212/g,'-');
 s=s.replace(/^([+-]?)\s*R\$\s*/i,'$1').replace(/^([+-])\s+/,'$1');
 let negative=false;if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1).trim();}
 if(s.startsWith('-')){if(negative)throw Error('Sinais negativos repetidos.');negative=true;s=s.slice(1);}else if(s.startsWith('+'))s=s.slice(1);
 // Spaces are accepted only as valid thousands grouping, never between arbitrary digits.
 if(/\s/.test(s)){if(!/^\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?$/.test(s))throw Error('Espaços em posição ambígua no valor.');s=s.replace(/\s/g,'');}
 if(!['auto','comma','dot'].includes(decimal))throw Error('Separador decimal inválido.');
 if(decimal==='auto'){
  if(s.includes('.')&&s.includes(','))decimal=s.lastIndexOf(',')>s.lastIndexOf('.')?'comma':'dot';
  else if(/[.,]/.test(s)){if(!/^\d+[.,]\d{1,2}$/.test(s))throw Error('Valor ambíguo: escolha o separador decimal ou corrija a linha.');decimal=s.includes(',')?'comma':'dot';}
 }
 const mark=decimal==='comma'?',':'.',group=mark===','?'.':',';
 if(s.includes(group)){const pattern=group==='.'?/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/:/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/;if(!pattern.test(s))throw Error('Separadores de milhar inválidos.');s=s.split(group).join('');}
 if(mark===',')s=s.replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error('Valor inválido: informe número com até duas casas decimais.');
 const [whole,fraction='']=s.split('.'),n=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));if(n>900000000000n)throw Error('Valor acima do limite.');return Number(negative?-n:n);
}
export async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
function cells(text){
 const first=text.split(/\r?\n/)[0];let quotedHeader=false;const counts={',':0,';':0,'\t':0};for(const c of first){if(c==='"')quotedHeader=!quotedHeader;else if(!quotedHeader&&Object.hasOwn(counts,c))counts[c]++;}const separator=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
 else if(c===separator){row.push(cell);cell='';closed=false;}
 else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';closed=false;}
 else if(c==='"'&&!cell.trim()&&!closed){cell='';quoted=true;}
 else {if((closed&&!/\s/.test(c))||c==='"')throw Error('Aspas inválidas próximas do registro '+(rows.length+1)+'. Corrija o arquivo para manter as colunas alinhadas.');if(!closed)cell+=c;}
 if(rows.length>2001||cell.length>4000||row.length>100)throw Error('CSV acima do limite de linhas, colunas ou tamanho de campo.');
 }
 if(quoted)throw Error('O CSV termina com aspas abertas. Corrija o arquivo para manter as colunas alinhadas.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function inspectCSV(text){
 if(typeof text!=='string'||text.length>2*1024*1024)throw Error('Selecione um CSV de até 2 MB.');
 const rows=cells(text.replace(/^\uFEFF/,'')),headers=rows.shift()||[],names=headers.map(normalize),signature=names.join('|');
 if(!rows.length||rows.length>2000)throw Error('O CSV deve conter de 1 a 2.000 movimentações.');
 return {headers,rows,format:signature==='date|title|amount'?'nubank-credit':signature==='data|valor|identificador|descricao'?'nubank-account':'mapped'};
}
function csvDate(value,format){
 const s=String(value||'').trim();if(validDate(s))return s;if(format==='iso')return '';
 const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(!m)return '';
 const d=format==='mdy'?m[2]:m[1],month=format==='mdy'?m[1]:m[2],out=`${m[3]}-${month.padStart(2,'0')}-${d.padStart(2,'0')}`;return validDate(out)?out:'';
}
export async function parseCSV(text,context){
 const {rows,headers,format}=inspectCSV(text),credit=Boolean(context.cardId),known=format!=='mapped';
 if(known&&(format==='nubank-credit')!==credit)throw Error(credit?'Este arquivo é de conta. Use Contas e lançamentos.':'Este arquivo é uma fatura. Abra a página do cartão.');
 if(credit&&!validDate(context.period+'-01'))throw Error('Escolha o mês da fatura.');
 if(!credit&&(typeof context.account!=='string'||!context.account.trim()||context.account.length>80))throw Error('Informe um nome para a conta (até 80 caracteres).');
 let mapping=known?{date:0,description:credit?1:3,amount:credit?2:1,id:credit?-1:2,dateFormat:credit?'iso':'dmy',decimal:'auto'}:context.mapping;
 if(!mapping||!['dmy','mdy','iso'].includes(mapping.dateFormat)||!['auto','comma','dot'].includes(mapping.decimal))throw Error('Indique as colunas e os formatos do CSV.');
 const cols=['date','description','amount'].map(k=>mapping[k]);if(cols.some(i=>!Number.isInteger(i)||i<0||i>=headers.length)||new Set(cols).size!==3)throw Error('Escolha três colunas diferentes para data, descrição e valor.');
 if(mapping.id!==-1&&(!Number.isInteger(mapping.id)||mapping.id<0||mapping.id>=headers.length||cols.includes(mapping.id)))throw Error('Escolha uma coluna distinta para o identificador, ou nenhuma.');
 if(!known&&(typeof context.bank!=='string'||!context.bank.trim()||context.bank.length>80))throw Error('Informe o nome do banco (até 80 caracteres).');
 const scope=credit?'card:'+context.cardId:'account:'+normalize(context.account),occurrences=new Map(),seenIds=new Set();
 return Promise.all(rows.map(async(raw,index)=>{
  const rawDate=raw[mapping.date]||'',rawAmount=raw[mapping.amount]||'',description=(raw[mapping.description]||'').trim(),date=csvDate(rawDate,mapping.dateFormat),providerId=mapping.id<0?'':(raw[mapping.id]||'').trim();
  const issues=[];let signed=null;if(raw.length!==headers.length)issues.push('Quantidade de colunas diferente do cabeçalho.');if(!date)issues.push('Data inválida para o formato escolhido.');if(!description||description.length>2000)issues.push('Descrição ausente ou muito longa.');try{signed=cents(rawAmount,mapping.decimal);if(!signed)issues.push('Valor zero: confirme o valor ou exclua a linha da seleção.');}catch(e){issues.push(e.message);}
  const repeatedId=providerId&&seenIds.has(providerId);if(providerId)seenIds.add(providerId);if(mapping.id>=0&&(!providerId||providerId.length>200||repeatedId))issues.push('Identificador ausente, longo ou repetido.');
  const identity=JSON.stringify([scope,date,normalize(description),signed]),occurrence=(occurrences.get(identity)||0)+1;occurrences.set(identity,occurrence);
  // Keep the original Nubank identities compatible with previously imported records.
  const identityText=known&&!issues.length?(credit?identity+'|'+occurrence:'nubank-account|'+providerId):'csv-v2|'+format+'|'+normalize(context.bank||'Nubank')+'|'+scope+'|'+(providerId&&!repeatedId?'id|'+providerId:JSON.stringify(raw)+'|'+occurrence);
  const key=await digest(identityText),label=normalize(description),installment=Boolean(installmentInfo(description));
  const payment=/pagamento (?:de )?fatura/.test(label)||(credit&&/pagamento recebido/.test(label));
  const type=!known||issues.length?'':payment?'fatura':credit?(signed>0?'despesa':/estorno|reembolso/.test(label)?'estorno':''):signed<0?(/pix|transferencia/.test(label)?'':'despesa'):(/salario/.test(label)?'receita':'');
  return {index,key,scope,date,description,amount:signed===null?0:Math.abs(signed),signed,type,installment,repeated:Boolean(repeatedId||occurrence>1),cardId:context.cardId||'',account:credit?'':context.account.trim(),invoicePeriod:credit?context.period:'',providerId,issues,raw,rawDate,rawAmount,format};
 }));
}
const merchant=value=>normalize(installmentInfo(value)?.base||String(value||'').replace(/\s*·\s*1\/1\s*$/,''));
export function reviewIndex(records,ledger){
 const history=new Map(),matches=new Map();
 for(const r of records){if(r.kind!=='entry')continue;const key=r.type+'|'+normalize(r.description);const ids=history.get(key)||new Set();ids.add(r.categoryId);history.set(key,ids);}
 for(const r of ledger){const key=Math.abs(r.amount)+'|'+merchant(r.description);const list=matches.get(key)||[];list.push(r);matches.set(key,list);}
 return {history,matches,categories:records.filter(r=>r.kind==='category'&&!r.archived),exact:new Set(records.filter(r=>r.csvKey).map(r=>r.csvKey))};
}
export function suggestion(row,records,index,rules=[],catalog=[],recurring=new Set()){
 const type=row.type==='estorno'?'despesa':row.type;
 if(!type||type==='transferencia')return {categoryId:'',categoryName:'',suggestionSource:'default'};
 const match=catalogMatch(row.description,catalog),possibleSubscription=type==='despesa'&&match?.category!=='Assinaturas'&&!row.reversal&&!installmentInfo(row.description)&&recurring.has(recurringKey(row));
 const personal=categoryHint(row,records,rules);
 if(personal)return {...personal,suggestionSource:'personal',possibleSubscription,merchant:match?.merchant||merchantName(row.description)};
 const explicit=type==='despesa'&&!(match?.category==='Assinaturas'&&installmentInfo(row.description))&&match?.category;
 const name=explicit||(possibleSubscription&&!match?'Assinaturas':({despesa:'Outros',fatura:'Pagamento de fatura',receita:'Recebimentos',investimento:'Investimentos',divida:'Pagamento de dívidas',saldo:'Saldo inicial'}[type]||''));
 const category=records.find(r=>r.kind==='category'&&!r.archived&&r.type===type&&catalogNormalize(r.name)===catalogNormalize(name));
 return {categoryId:category?.id||'',categoryName:category?.name||name,suggestionSource:explicit?'catalog':possibleSubscription&&!match?'recurrence':'default',possibleSubscription,merchant:match?.merchant||merchantName(row.description),...(match?{catalogRuleId:match.rule_id,catalogVersion:match.version}:{}),ruleApplied:Boolean(explicit)};
}
export function duplicates(row,records,ledger,index){
 index??=reviewIndex(records,ledger);const exact=index.exact.has(row.key),possible=row.repeated||(index.matches.get(row.amount+'|'+merchant(row.description))||[]).some(r=>row.cardId?(r.cardId===row.cardId&&(r.date.startsWith(row.invoicePeriod)||(r.originalDate||r.date)===row.date)):(r.originalDate||r.date)===row.date);
 return {exact,possible:!exact&&Boolean(possible)};
}
export const recurringKey=r=>JSON.stringify([r.cardId?'card:'+r.cardId:'account:'+normalize(r.account||''),normalize(r.description)]);
export function recurringCandidates(records){
 const groups=new Map();
 for(const record of records){const r=record.kind==='purchase'&&record.count===1?{...record,kind:'entry',type:'despesa',description:record.name}:record;if(r.kind!=='entry'||r.type!=='despesa'||r.reversal||r.installment||installmentInfo(r.description))continue;const key=recurringKey(r);if(!normalize(r.description))continue;const a=groups.get(key)||[];a.push(r);groups.set(key,a);}
 const result=[];
 for(const [key,rows]of groups){rows.sort((a,b)=>a.date.localeCompare(b.date));const byMonth=new Map();for(const r of rows){const m=r.date.slice(0,7);if(byMonth.has(m))byMonth.set(m,null);else byMonth.set(m,r);}const a=[...byMonth.values()].filter(Boolean);if(a.length<2)continue;
 let chain=[a[a.length-1]];for(let i=a.length-2;i>=0;i--){const next=chain[0],days=(Date.parse(next.date)-Date.parse(a[i].date))/86400000;if(days<20||days>40||Math.abs(next.amount-a[i].amount)/Math.max(next.amount,a[i].amount)>.15)break;chain.unshift(a[i]);}
 if(chain.length<2)continue;const last=chain.at(-1);result.push({key,name:last.description,amount:last.amount,lastDate:last.date,cardId:last.cardId||'',account:last.account||'',occurrences:chain.length,categoryId:last.categoryId});
 }
 return result;
}
export function forecast(rules,records,period){
 if(!validDate(period+'-01'))return [];
 return (rules||[]).filter(r=>r.status==='active'&&r.nextDate.slice(0,7)<=period).map(r=>{
 const day=Math.min(+r.nextDate.slice(8),new Date(Date.UTC(+period.slice(0,4),+period.slice(5),0)).getUTCDate());
 const actual=records.some(record=>{const x=record.kind==='purchase'&&record.count===1?{...record,kind:'entry',type:'despesa',description:record.name,invoicePeriod:record.firstDue.slice(0,7)}:record;return x.kind==='entry'&&x.type==='despesa'&&!x.reversal&&recurringKey(x)===r.key&&(x.invoicePeriod||x.date.slice(0,7))===period;});
 return {...r,date:period+'-'+String(day).padStart(2,'0'),actual};
 });
}
export function validateRules(rules,records){
 if(!Array.isArray(rules)||rules.length>2000)throw Error('Lista de recorrências inválida.');const keys=new Set();
 for(const r of rules){if(!r||typeof r.key!=='string'||r.key.length>2300||keys.has(r.key)||!['active','ignored'].includes(r.status)||typeof r.name!=='string'||!r.name.trim()||r.name.length>2000||!Number.isSafeInteger(r.amount)||r.amount<1||r.amount>900000000000||!validDate(r.nextDate)||typeof r.account!=='string'||r.account.length>80||typeof r.cardId!=='string'||(r.cardId&&!records.some(x=>x.kind==='card'&&x.id===r.cardId)))throw Error('Recorrência inválida.');keys.add(r.key);}
 return rules;
}
