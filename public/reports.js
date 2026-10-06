// Staff reports share the server's authoritative date ranges and totals.
const reportMoney=n=>Number(n||0).toLocaleString('ru-RU')+' ₽';
const reportStates={orders:{period:'today',from:'',to:'',status:'all',rows:[],next:null,generation:0,loading:false,pages:1},revenue:{period:'today',from:'',to:'',status:'all',rows:[],next:null,generation:0,loading:false,pages:1}};
const presets=[['today','Сегодня'],['yesterday','Вчера'],['week','За неделю'],['month','За месяц'],['custom','Выбрать период'],['all','За всё время']];
for(const kind of ['orders','revenue']){
 const host=document.getElementById(kind+'Period');
 host.innerHTML=`<div class="period-buttons">${presets.map(([v,label])=>`<button type="button" class="secondary" data-period="${v}" aria-pressed="${v==='today'}">${label}</button>`).join('')}</div><form class="date-range" hidden><label>С<input type="date" name="from" required></label><label>По<input type="date" name="to" required></label><button class="primary">Показать</button></form><p class="range-label"></p><p class="report-error" role="alert"></p>`;
 host.querySelectorAll('[data-period]').forEach(button=>button.onclick=()=>{const state=reportStates[kind];host.querySelector('form').hidden=button.dataset.period!=='custom';if(button.dataset.period==='custom'){host.querySelector('input').focus();return;}state.period=button.dataset.period;reloadReport(kind);});
 host.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,state=reportStates[kind];if(!f.from.value||!f.to.value||f.from.value>f.to.value){host.querySelector('.report-error').textContent='Укажите даты: «С» должна быть не позже «По».';return;}Object.assign(state,{period:'custom',from:f.from.value,to:f.to.value});reloadReport(kind);};
}
function reportQuery(kind,cursor){const s=reportStates[kind];const p=new URLSearchParams({kind,period:s.period,status:s.status});if(s.period==='custom'){p.set('from',s.from);p.set('to',s.to);}if(cursor)p.set('cursor',JSON.stringify(cursor));return 'staff-report?'+p;}
function reloadReport(kind){const s=reportStates[kind];const host=document.getElementById(kind+'Period');host.querySelector('.range-label').textContent='Загружаем выбранный период…';host.querySelectorAll('[data-period]').forEach(b=>{b.classList.toggle('active',b.dataset.period===s.period);b.setAttribute('aria-pressed',String(b.dataset.period===s.period));});if(kind==='revenue')for(const key of ['total','cash','card','count'])$('#revenue-'+key).textContent='—';else $('#ordersCount').textContent='';s.pages=1;s.rows=[];s.next=null;s.generation++;if(kind==='orders'){orderRows=[];lastOrders='';$('#ordersList').replaceChildren();}else $('#revenueList').replaceChildren();loadReport(kind,false,true);}
function reportRange(kind,result){const host=document.getElementById(kind+'Period');host.querySelector('.range-label').textContent=result.period.preset==='all'?'За всё время · Москва':result.period.from.split('-').reverse().join('.')+' — '+result.period.to.split('-').reverse().join('.')+' · Москва';host.querySelectorAll('[data-period]').forEach(b=>{const chosen=b.dataset.period===reportStates[kind].period;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));});}
async function loadReport(kind,append=false,force=false){
 if(!['owner','staff'].includes(role))return;
 const s=reportStates[kind];if(s.loading&&!force)return;if(append&&!s.next)return;
 const generation=++s.generation;s.loading=true;const host=document.getElementById(kind+'Period'),box=document.getElementById(kind==='orders'?'ordersList':'revenueList'),more=kind==='orders'?moreOrders:$('#revenueMore');
 host.querySelector('.report-error').textContent='';box.setAttribute('aria-busy','true');more.disabled=true;if(!s.rows.length)box.innerHTML='<p class="empty">Загружаем…</p>';
 try{let cursor=append?s.next:null,result,rows=[];const pages=append?1:s.pages;for(let i=0;i<pages;i++){result=await api(reportQuery(kind,cursor));if(generation!==s.generation)return;rows.push(...result.rows);cursor=result.next;if(!cursor)break;}
 if(generation!==s.generation)return;s.rows=append?[...s.rows,...rows.filter(o=>!s.rows.some(x=>x.id===o.id))]:rows;s.next=cursor;if(append)s.pages++;reportRange(kind,result);more.hidden=!cursor;
 if(kind==='orders'){orderRows=s.rows;const snap=JSON.stringify(orderRows);if(snap!==lastOrders||!orderRows.length){lastOrders=snap;renderOrders();}$('#ordersCount').textContent='Заказов за период: '+result.summary.count;updateStats();$('#newOrders').textContent=result.summary.newCount??orderRows.filter(o=>o.status==='Новый').length;}
 else{for(const key of ['total','cash','card'])$('#revenue-'+key).textContent=reportMoney(result.summary[key]);$('#revenue-count').textContent=result.summary.count;box.innerHTML=s.rows.map(o=>`<article class="order-card"><b>№ ${esc(o.number||o.id)}</b><p>${o.source==='counter'?'Касса':'Мини-приложение'} · ${new Date(o.paidAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})}</p><strong>${reportMoney(o.total)}</strong><p>${o.payment==='cash'?'Наличными':'Картой'}</p><button class="secondary" data-view-order="${esc(o.id)}">Открыть заказ</button></article>`).join('')||'<p class="empty">За выбранный период полученных оплат нет.</p>';box.querySelectorAll('[data-view-order]').forEach(b=>b.onclick=()=>openSavedOrder(b.dataset.viewOrder));}
 }catch(e){if(generation===s.generation){host.querySelector('.report-error').textContent=e.message;if(!s.rows.length)box.innerHTML='<p class="empty">Не удалось загрузить данные. <button class="secondary" data-retry-report>Повторить</button></p>';box.querySelector('[data-retry-report]')?.addEventListener('click',()=>loadReport(kind,false,true));}}
 finally{if(generation===s.generation){s.loading=false;box.setAttribute('aria-busy','false');more.disabled=false;}}
}
orders=async function(){if(!$('#orders').hidden)await loadReport('orders');};
moreOrders.onclick=()=>loadReport('orders',true);
$('#revenueMore').onclick=()=>loadReport('revenue',true);
$$('[data-filter]').forEach(b=>b.onclick=()=>{orderFilter=b.dataset.filter;reportStates.orders.status=orderFilter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));reloadReport('orders');});
const reportBaseTab=tab;
tab=function(id){reportBaseTab(id);if(id==='orders'||id==='revenue')loadReport(id);};
setInterval(()=>{if(!document.hidden&&!$('#revenue').hidden)loadReport('revenue');},10000);
// A saved order is displayed immediately, independently of the previously selected period.
async function openSavedOrder(id){try{const rows=await api('orders-state',{ids:[id]});if(!rows.length)throw Error('Заказ не найден');const o=rows[0];tab('orders');const panel=$('#focusedOrder');panel.hidden=false;panel.innerHTML=`<button class="secondary" id="closeFocusedOrder">Закрыть выбранный заказ</button><div id="focusedOrderContent"></div>`;renderOrders([o],$('#focusedOrderContent'),'all');$('#closeFocusedOrder').onclick=()=>panel.hidden=true;panel.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){toast(e.message);}}
window.addEventListener('vz-open-order',e=>openSavedOrder(e.detail.id));
window.addEventListener('vz-order-saved',e=>{if(e.detail?.id){const toastBox=$('#savedOrderNotice');toastBox.hidden=false;toastBox.scrollIntoView({behavior:'smooth',block:'center'});toastBox.querySelector('button').onclick=()=>{toastBox.hidden=true;openSavedOrder(e.detail.id);};}});
$$('[data-report-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.reportTab));

if(['owner','staff'].includes(role))orders();
