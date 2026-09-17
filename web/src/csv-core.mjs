// Pure rules shared by the browser preview and the authenticated server.
export const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value&&+value.slice(0,4)>=1900&&+value.slice(0,4)<=2200;
export function cents(value){let s=String(value).trim();if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');if(!/^-?\d+(?:\.\d{1,2})?$/.test(s))throw Error('Valor inválido no CSV.');const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||Math.abs(n)>900000000000)throw Error('Valor acima do limite.');return n;}
export async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
function cells(text){
 const separator=text.slice(0,text.search(/[\r\n]/)<0?text.length:text.search(/[\r\n]/)).includes(';')?';':',';
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
 else if(c===separator){row.push(cell);cell='';closed=false;}
 else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';closed=false;}
 else if(c==='"'&&!cell&&!closed)quoted=true;
 else {if(closed||c==='"')throw Error('Aspas inválidas no CSV.');cell+=c;}
 if(rows.length>2001||cell.length>4000)throw Error('Limite de 2.000 movimentações por arquivo.');
 }
 if(quoted)throw Error('O CSV termina com aspas abertas.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export async function parseCSV(text,context){
 if(typeof text!=='string'||text.length>2*1024*1024)throw Error('Selecione um CSV de até 2 MB.');
 const rows=cells(text.replace(/^\uFEFF/,'')),headers=(rows.shift()||[]).map(normalize);
 const credit=headers.join('|')==='date|title|amount',debit=headers.join('|')==='data|valor|identificador|descricao';
 if(!credit&&!debit)throw Error('Formato não reconhecido. Use o CSV original de extrato ou fatura Nubank.');
 if(credit!==Boolean(context.cardId))throw Error(credit?'Importe a fatura na página do cartão.':'Este arquivo é um extrato de conta. Use a aba Contas e lançamentos.');
 if(credit&&!validDate(context.period+'-01'))throw Error('Escolha o mês da fatura.');
 if(!credit&&(typeof context.account!=='string'||!context.account.trim()||context.account.length>80))throw Error('Informe um nome para a conta (até 80 caracteres).');
 if(!rows.length||rows.length>2000)throw Error('O CSV deve conter de 1 a 2.000 movimentações.');
 const scope=credit?'card:'+context.cardId:'account:'+normalize(context.account),occurrences=new Map(),seenIds=new Set();
 return Promise.all(rows.map(async(cols,index)=>{
  if(cols.length!==headers.length)throw Error('Colunas inválidas na linha '+(index+2)+'.');
  const rawDate=cols[0].trim(),match=rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),date=credit?rawDate:match?`${match[3]}-${match[2]}-${match[1]}`:'';
  if(!validDate(date))throw Error('Data inválida na linha '+(index+2)+'.');
  const description=cols[credit?1:3].trim();if(!description||description.length>2000)throw Error('Descrição inválida na linha '+(index+2)+'.');
  const signed=cents(cols[credit?2:1]),providerId=credit?'':cols[2].trim();if(!signed)throw Error('Valor zero na linha '+(index+2)+'. Remova esta linha antes de importar.');
  if(!credit&&(!providerId||providerId.length>200||seenIds.has(providerId)))throw Error('Identificador ausente ou repetido na linha '+(index+2)+'.');seenIds.add(providerId);
  const identity=JSON.stringify([scope,date,normalize(description),signed]);const occurrence=(occurrences.get(identity)||0)+1;occurrences.set(identity,occurrence);
  const key=await digest(credit?identity+'|'+occurrence:'nubank-account|'+providerId);
  const text=normalize(description),payment=/pagamento (?:de )?fatura|pagamento recebido/.test(text),installment=/parcela\s+\d+\s*\/\s*\d+|\b\d+\s*\/\s*\d+\b/i.test(description);
  let type=payment?'fatura':credit?(signed>0?'despesa':/estorno|reembolso/.test(text)?'estorno':''):signed<0?(/pix|transferencia/.test(text)?'':'despesa'):(/salario/.test(text)?'receita':'');
  return {index,key,scope,date,description,amount:Math.abs(signed),signed,type,installment,repeated:credit&&occurrence>1,cardId:context.cardId||'',account:credit?'':context.account.trim(),invoicePeriod:credit?context.period:'',providerId};
 }));
}
const categoryRules=[[/netflix|spotify|amazon prime|disney|youtube|icloud|google one|assinatura|openai|chatgpt/,'Assinaturas'],[/mercado|supermercado|atacadao|assai|carrefour/,'Supermercado'],[/ifood|restaurante|lanchonete|padaria|pizzaria/,'Alimentação'],[/uber|99app|posto|combustivel|estacionamento/,'Transporte'],[/farmacia|drogaria|hospital|clinica/,'Saúde'],[/escola|curso|faculdade|livraria/,'Educação'],[/energia|eletric|agua|internet|aluguel/,'Moradia']];
const merchant=value=>normalize(String(value||'').replace(/\s*[·-]?\s*(?:Parcela\s*)?\d+\/\d+\s*$/i,''));
export function reviewIndex(records,ledger){
 const history=new Map(),matches=new Map();
 for(const r of records){if(r.kind!=='entry')continue;const key=r.type+'|'+normalize(r.description);const ids=history.get(key)||new Set();ids.add(r.categoryId);history.set(key,ids);}
 for(const r of ledger){const key=Math.abs(r.amount)+'|'+merchant(r.description);const list=matches.get(key)||[];list.push(r);matches.set(key,list);}
 return {history,matches,categories:records.filter(r=>r.kind==='category'&&!r.archived),exact:new Set(records.filter(r=>r.csvKey).map(r=>r.csvKey))};
}
export function suggestion(row,records,index){
 const type=row.type==='estorno'?'despesa':row.type;if(!type||type==='transferencia')return {categoryId:'',categoryName:''};
 index??=reviewIndex(records,[]);const ids=[...(index.history.get(type+'|'+normalize(row.description))||[])];const known=ids.length===1?index.categories.find(r=>r.id===ids[0]):null;
 const name=known?.name||(type==='fatura'?'Pagamento de fatura':type==='receita'?'Recebimentos':categoryRules.find(([re])=>re.test(normalize(row.description)))?.[1]||'');
 const category=known||index.categories.find(r=>r.type===type&&normalize(r.name)===normalize(name));return {categoryId:category?.id||'',categoryName:name};
}
export function duplicates(row,records,ledger,index){
 index??=reviewIndex(records,ledger);const exact=index.exact.has(row.key),possible=row.repeated||(index.matches.get(row.amount+'|'+merchant(row.description))||[]).some(r=>row.cardId?(r.cardId===row.cardId&&(r.date.startsWith(row.invoicePeriod)||(r.originalDate||r.date)===row.date)):(r.originalDate||r.date)===row.date);
 return {exact,possible:!exact&&Boolean(possible)};
}
export const recurringKey=r=>JSON.stringify([r.cardId?'card:'+r.cardId:'account:'+normalize(r.account||''),normalize(r.description)]);
export function recurringCandidates(records){
 const groups=new Map();
 for(const record of records){const r=record.kind==='purchase'&&record.count===1?{...record,kind:'entry',type:'despesa',description:record.name}:record;if(r.kind!=='entry'||r.type!=='despesa'||r.reversal||r.installment||/parcela|\b\d+\s*\/\s*\d+\b/i.test(r.description))continue;const key=recurringKey(r);if(!normalize(r.description))continue;const a=groups.get(key)||[];a.push(r);groups.set(key,a);}
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
