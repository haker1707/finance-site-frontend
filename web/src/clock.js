let timer=null,node=null,observer=null;
export function stopClock(){clearInterval(timer);timer=null;observer?.disconnect();observer=null;node=null;}
export function mountClock(){
 stopClock();node=document.querySelector('[data-live-clock]');if(!node)return;
 const formatter=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 const tick=()=>{if(!node?.isConnected){stopClock();return;}const now=new Date(),parts=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));node.textContent=`${parts.day}/${parts.month}/${parts.year} • ${parts.hour}:${parts.minute}:${parts.second}`;node.dateTime=now.toISOString();node.title='Horário do dispositivo · '+formatter.resolvedOptions().timeZone;};
 tick();timer=setInterval(tick,1000);observer=new MutationObserver(()=>{if(!node?.isConnected)stopClock();});observer.observe(document.querySelector('#app'),{childList:true,subtree:true});
}
window.addEventListener('pagehide',stopClock);
window.addEventListener('pageshow',()=>{if(document.querySelector('[data-live-clock]'))mountClock();});
