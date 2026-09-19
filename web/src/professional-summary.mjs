import {needsReview,installmentEstimates} from './intelligence.mjs';
import {invoiceState} from './invoice-payments.mjs';
export const professionalPermissions=Object.freeze({viewTransactions:true,viewCards:true,viewAssets:true,viewGoals:true,createPlanning:false,createGoals:false,editTransactions:false,deleteTransactions:false,editAccounts:false,editBankIntegrations:false});
export function selectPeriodRows(state,F,active,scope='all'){
 const cards=new Map(state.records.filter(r=>r.kind==='card').map(r=>[r.id,r]));let unknown=0;
 const rows=F.ledger(state.records).filter(r=>scope==='debit'?!r.cardId:scope==='credit'?!!r.cardId:scope==='all'||r.cardId===scope).map(r=>{let calculationDate=r.originalDate||r.date;if(r.cardId&&r.type!=='fatura'){if(r.derived)calculationDate=r.date;else if(r.invoicePeriod){const card=cards.get(r.cardId);calculationDate=card?.due?F.date(+r.invoicePeriod.slice(0,4),+r.invoicePeriod.slice(5,7),card.due):'';}}if(!calculationDate)unknown++;return {...r,calculationDate};}).filter(r=>r.calculationDate>=active.start&&r.calculationDate<=active.end).sort((a,b)=>b.calculationDate.localeCompare(a.calculationDate)||a.id.localeCompare(b.id));return {rows,unknown};
}
export function professionalSummary(doc,F,start,end,today){
 const records=doc.records||[],state={...doc,records},selection=selectPeriodRows(state,F,{start,end}),totals=F.summarize(selection.rows,'');
 const pending=new Set(records.filter(r=>r.kind==='entry'&&needsReview(r)).map(r=>r.id));
 const categories=new Set(records.filter(r=>r.kind==='category').map(r=>r.id));
 for(const r of records)if(r.kind==='entry'&&r.type!=='transferencia'&&!categories.has(r.categoryId))pending.add(r.id);
 const unresolved=(doc.installmentPending||[]).filter(p=>records.some(r=>r.id===p.entryId));for(const p of unresolved)pending.add(p.entryId);
 const alerts=[];
 if(pending.size)alerts.push({code:'pending',count:pending.size,label:`${pending.size} lançamento(s) com pendências`,route:'entries'});
 if(unresolved.length)alerts.push({code:'installment',count:unresolved.length,label:`${unresolved.length} vínculo(s) de parcelas a resolver`,route:'cards'});
 let overdue=0;for(const s of doc.invoiceStatements||[]){if(s.due>=today)continue;const x=invoiceState(state,s.cardId,s.period,F);if(x.fresh&&s.outstandingConfirmed&&x.remaining>0)overdue++;}
 if(overdue)alerts.push({code:'overdue',count:overdue,label:`${overdue} fatura(s) vencida(s) com saldo aberto confirmado`,route:'cards'});
 // Budgets are compared against their full calendar month, never prorated.
 let budgetExceeded=0;const ledger=F.ledger(records);
 for(const b of records.filter(r=>r.kind==='budget'&&r.period>=start.slice(0,7)&&r.period<=end.slice(0,7))){const category=records.find(c=>c.id===b.categoryId);if(category?.type!=='despesa')continue;const spent=ledger.filter(r=>r.type==='despesa'&&r.categoryId===b.categoryId&&r.date.startsWith(b.period)).reduce((s,r)=>s+r.amount,0);if(spent>b.amount)budgetExceeded++;}
 if(budgetExceeded)alerts.push({code:'budget',count:budgetExceeded,label:`${budgetExceeded} orçamento(s) mensal(is) de despesa excedido(s)`,route:'budget'});
 const goals=records.filter(r=>r.kind==='goal').map(g=>({goal:g,progress:F.goalProgress(g,records,today)})),activeGoals=goals.filter(x=>x.progress.remaining>0).length;
 const lateGoals=goals.filter(x=>x.progress.remaining>0&&x.goal.deadline&&x.goal.deadline<today).length;
 if(lateGoals)alerts.push({code:'goal-deadline',count:lateGoals,label:`${lateGoals} meta(s) com prazo passado e valor ainda não atingido`,route:'goals'});
 const lastAssets=new Map();for(const r of records.filter(r=>r.kind==='asset'&&r.date<=end)){const key=r.name.trim().toLowerCase(),old=lastAssets.get(key);if(!old||old.date<r.date)lastAssets.set(key,r);}
 const assetValue=lastAssets.size?[...lastAssets.values()].reduce((s,r)=>s+r.amount,0):null;
 const duration=Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
 const previousEnd=new Date(Date.parse(start+'T12:00:00Z')-86400000).toISOString().slice(0,10),previousStart=new Date(Date.parse(start+'T12:00:00Z')-duration*86400000).toISOString().slice(0,10);
 const previous=F.validDate(previousStart)?F.summarize(selectPeriodRows(state,F,{start:previousStart,end:previousEnd}).rows,''):null;
 const nextEnd=new Date(Date.parse(today+'T12:00:00Z')+29*86400000).toISOString().slice(0,10),future=F.summarize(selectPeriodRows(state,F,{start:today,end:nextEnd}).rows,'');
 const estimates=installmentEstimates(doc.installmentPlans,records).filter(r=>r.dueDate>=today&&r.dueDate<=nextEnd),estimated=estimates.reduce((s,r)=>s+r.amount,0);
 return {totals,assetValue,activeGoals,pendingCount:pending.size,attention:alerts.some(a=>!['pending','installment'].includes(a.code)),alerts,unknownDates:selection.unknown,comparison:previous?{start:previousStart,end:previousEnd,income:totals.income-previous.income,expense:totals.expense-previous.expense}:null,future:{start:today,end:nextEnd,registered:future.totalOut,estimated,ambiguous:unresolved.length>0,bills:records.filter(r=>r.kind==='bill'&&!r.paid&&r.date>=today&&r.date<=nextEnd).length}};
}
