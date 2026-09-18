// Pure matching, also bundled into the browser. No account data leaves this engine.
export const catalogNormalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const includes=(text,term)=>(' '+text+' ').includes(' '+catalogNormalize(term)+' ');
export function catalogMatch(description,rules=[]){
 const text=catalogNormalize(description);
 return rules.filter(r=>r.active&&r.keywords.some(k=>includes(text,k))&&!r.exclusions.some(k=>includes(text,k)))
 .map(r=>({...r,specificity:Math.max(...r.keywords.filter(k=>includes(text,k)).map(k=>catalogNormalize(k).length))}))
 .sort((a,b)=>b.priority-a.priority||b.specificity-a.specificity||(String(a.rule_id)<String(b.rule_id)?-1:String(a.rule_id)>String(b.rule_id)?1:0)||b.version-a.version)[0]||null;
}
export function validateCatalogRule(input){
 const field=(value,label,optional=false)=>{if(optional&&(value===null||value===''))return null;if(typeof value!=='string'||!value.trim()||value.trim().length>80||/[\r\n@]|\d{5,}/.test(value))throw Error(label+': use apenas um nome genérico de até 80 caracteres, sem dados pessoais.');return value.trim();};
 const list=(value,label,required)=>{if(!Array.isArray(value)||value.length>20||required&&!value.length)throw Error(label+': informe de 1 a 20 palavras ou expressões.');return [...new Set(value.map(v=>catalogNormalize(field(v,label))))];};
 const keywords=list(input.keywords,'Palavras-chave',true),exclusions=list(input.exclusions||[],'Exclusões',false);
 if(keywords.some(k=>k.length<2))throw Error('Use palavras-chave com pelo menos dois caracteres.');
 const priority=input.priority??0;if(!Number.isInteger(priority)||priority<0||priority>1000)throw Error('Prioridade deve estar entre 0 e 1000.');
 if(input.active!==undefined&&typeof input.active!=='boolean')throw Error('Estado inválido.');
 return {keywords,exclusions,merchant:field(input.merchant,'Estabelecimento'),category:field(input.category,'Categoria',true),priority,active:input.active!==false};
}
