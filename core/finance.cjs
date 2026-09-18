'use strict';
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TYPES={receita:'Receita',despesa:'Despesa',investimento:'Investimento',divida:'Pagamento de dívida',transferencia:'Transferência',saldo:'Saldo inicial',fatura:'Pagamento de fatura'};
function money(input){
 if(typeof input==='number') {if(!Number.isFinite(input))throw Error('Valor inválido'); input=input.toFixed(6);}
 let s=String(input??'').trim().replace(/^R\$\s*/,'').replace(/\s/g,'');
 if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 if(!/^-?\d+(\.\d+)?$/.test(s))throw Error('Informe um valor, como 1.250,50.');
 const neg=s.startsWith('-');s=s.replace(/^-/,'');const [a,b='']=s.split('.');let v=BigInt(a)*100n+BigInt((b+'00').slice(0,2));if(Number(b[2]||0)>=5)v++;
 if(v>900000000000n)throw Error('Valor acima do limite permitido.');return Number(neg?-v:v);
}
function integer(v,min=0,max=900000000000){if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('Número fora do intervalo permitido.');return v;}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s&&+s.slice(0,4)>=1900&&+s.slice(0,4)<=2200;}
function date(y,m,d){integer(y,1900,2200);integer(m,1,12);integer(d,1,31);return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(d,new Date(Date.UTC(y,m,0)).getUTCDate())).padStart(2,'0')}`;}
function addMonths(s,n){if(!validDate(s))throw Error('Data inválida.');const [y,m,d]=s.split('-').map(Number);const t=new Date(Date.UTC(y,m-1+n,1));return date(t.getUTCFullYear(),t.getUTCMonth()+1,d);}
function split(total,n){integer(total,0);integer(n,1,600);const q=Math.floor(total/n),r=total%n;return Array.from({length:n},(_,i)=>q+(i<r?1:0));}
function firstDue(purchase,closing,due){if(!validDate(purchase))throw Error('Data da compra inválida.');integer(closing,1,31);integer(due,1,31);const [y,m,d]=purchase.split('-').map(Number);const closeDay=+date(y,m,closing).slice(8);const closeMonth=addMonths(date(y,m,1),d>closeDay?1:0);return addMonths(date(+closeMonth.slice(0,4),+closeMonth.slice(5,7),due),due<=closing?1:0);}
function schedule(p){if(p.schedule)return p.schedule;const start=integer(p.currentInstallment??1,1,p.count);return split(p.amount,p.count).slice(start-1).map((amount,i)=>{const m=addMonths(p.firstDue,i);return {number:start+i,date:date(+m.slice(0,4),+m.slice(5,7),p.dueDay||+p.firstDue.slice(8)),amount};});}
function fullSchedule(p){if(p.schedule)return p.schedule.map((x,i)=>({...x,number:i+1,historical:false,estimated:false}));const start=integer(p.currentInstallment??1,1,p.count);return split(p.amount,p.count).map((amount,i)=>{const m=addMonths(p.firstDue,i-start+1);return {number:i+1,date:date(+m.slice(0,4),+m.slice(5,7),p.dueDay||+p.firstDue.slice(8)),amount,historical:i+1<start,estimated:i+1<start};});}
function reserve(s){const months=((s.employed?3:12)+(s.children?12:3)+(s.support?3:12))/3;return {months,target:integer(Math.round(s.cost*months),0)};}
function allocate(income,bps){integer(income,0);bps.forEach(v=>integer(v,0,10000));if(bps.reduce((a,b)=>a+b,0)!==10000)throw Error('Os percentuais precisam somar 100%.');const raw=bps.map(v=>BigInt(income)*BigInt(v));const vals=raw.map(v=>Number(v/10000n));let left=income-vals.reduce((a,b)=>a+b,0);const order=raw.map((v,i)=>({i,r:Number(v%10000n)})).sort((a,b)=>b.r-a.r||a.i-b.i);for(let i=0;i<left;i++)vals[order[i].i]++;return vals;}
function ledger(records){const tx=records.filter(r=>r.kind==='entry').map(r=>({...r,derived:false}));for(const p of records.filter(r=>r.kind==='purchase'))for(const [i,x] of schedule(p).entries())tx.push({id:p.id+':'+((x.number??i+1)-1),kind:'entry',date:x.date,amount:x.amount,type:'despesa',categoryId:p.categoryId,description:`${p.name} · ${x.number??i+1}/${p.count}`,cardId:p.cardId,purchaseId:p.id,derived:true});return tx;}
function summarize(entries,period){const a=entries.filter(x=>x.date.startsWith(period));const sum=t=>a.filter(x=>x.type===t).reduce((s,x)=>s+x.amount,0);const income=sum('receita'),expense=sum('despesa'),investment=sum('investimento'),debt=sum('divida'),opening=sum('saldo');return {income,expense,investment,debt,opening,balance:income+opening-expense-investment-debt,totalOut:expense+investment+debt};}
function goalProgress(goal,records,today){const accumulated=(goal.initial||0)+records.filter(r=>r.kind==='contribution'&&r.goalId===goal.id).reduce((a,r)=>a+r.amount,0);const remaining=Math.max(0,goal.target-accumulated);const days=goal.deadline&&validDate(goal.deadline)?Math.ceil((new Date(goal.deadline+'T12:00:00Z')-new Date(today+'T12:00:00Z'))/86400000):null;return {accumulated,remaining,percent:goal.target?accumulated/goal.target*100:0,days,monthly:days>0?Math.round(remaining*30/days):null};}
module.exports={MONTHS,TYPES,money,integer,validDate,date,addMonths,split,firstDue,schedule,fullSchedule,reserve,allocate,ledger,summarize,goalProgress};
