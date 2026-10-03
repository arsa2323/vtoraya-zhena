import fs from 'node:fs';import ts from 'typescript';import {DatabaseSync} from 'node:sqlite';import assert from 'node:assert/strict';
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('drizzle/0000_purple_sentry.sql','utf8').replaceAll('--> statement-breakpoint',''));
let failBatchAt=-1;
const binding={prepare(sql){let args=[];return{bind(...a){args=a;return this},execute(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}}},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){return this.execute()}}},async batch(statements){db.exec('BEGIN');try{const rows=statements.map((s,i)=>{if(i===failBatchAt)throw Error('Simulated database failure');return s.execute()});db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
const menuExports={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/menu-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(menuExports);
const reportExports={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/staff-reports.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(reportExports);
const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);const hex=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex');
let src=fs.readFileSync('app/api/[...path]/route.ts','utf8').replace("import {env,waitUntil} from 'cloudflare:workers';",'const env = argumentsNotUsed;const waitUntil=p=>background.push(p);').replace('e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',hex);
src=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={},background=[],testEnv={DB:binding};let sendMock=async()=>{throw Error('No live messages in tests')};new Function('exports','argumentsNotUsed','require','background','fetch',src)(exports,testEnv,path=>path.includes('staff-reports')?reportExports:menuExports,background,(...args)=>sendMock(...args));
const owner={'oai-authenticated-user-id':'test-owner','oai-authenticated-user-email':'bagandovarsen228@gmail.com'};
async function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Test'})});p.sort();const text='8772857082:WebAppData\n'+[...p].map(([k,v])=>k+'='+v).join('\n');p.set('signature',Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(text))).toString('base64url'));return{'x-telegram-init-data':p.toString()};}
async function call(path,headers={},body){const r=await exports[body?'POST':'GET'](new Request('https://example.test/api/'+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})}));return{status:r.status,data:await r.json()};}
assert.equal((await call('orders')).status,401);assert.equal((await call('me',{'x-telegram-init-data':'user=%7B%22id%22:1%7D&signature=bad&auth_date=1'})).status,401);
await call('product',owner,{id:'test',name:'Тест',cat:'Обеды',price:500,available:true,trackStock:true,stock:3});await call('settings',owner,{address:'Адрес',accepting:true,deliveryEnabled:false,fee:0,minimum:0,zone:'',staff:['tg:3']});
const customer=await signed(1),other=await signed(2),staff=await signed(3),telegramOwner=await signed(5850652180);assert.equal((await call('manage',customer)).status,403);assert.equal((await call('manage',telegramOwner)).status,200);const order={key:crypto.randomUUID(),items:[{id:'test',quantity:2}],name:'Тест',phone:'79990000000',delivery:'pickup',payment:'cash',total:1};
const first=await call('orders',customer,order);assert.equal(first.status,200);assert.equal(first.data.total,1000);assert.equal((await call('orders',customer,order)).data.id,first.data.id);assert.equal((await call('orders',customer)).data.length,1);assert.equal((await call('orders',other)).data.length,0);assert.equal((await call('orders?all=1',customer)).status,403);assert.equal((await call('process',other,{id:first.data.id})).status,403);assert.equal((await call('process',staff,{id:first.data.id})).status,200);assert.equal((await call('orders',customer)).data[0].status,'Обработан');assert.equal((await call('orders',customer,{...order,key:crypto.randomUUID(),items:[{id:'test',quantity:2}]})).status,409);assert.equal((await call('orders',customer,{...order,key:crypto.randomUUID(),items:[{id:'test',quantity:-1}]})).status,400);console.log('PASS: signature verification, Telegram owner, permissions, server price, idempotency, stock depletion, history isolation, staff processing. Test DB only.');

const product=(id,stock)=>({id,name:'Тест '+id,cat:'Обеды',price:500,available:true,trackStock:true,stock,image:'/dish.jpg'});
const stored=id=>JSON.parse(db.prepare('SELECT data FROM records WHERE id=?').get(id).data);
const payload=(id,key=crypto.randomUUID())=>({...order,key,items:[{id,quantity:1}]});
for(const route of ['orders','pos-order']){
 const auth=route==='orders'?customer:staff;
 const id='race-'+route;await call('product',owner,product(id,1));
 const results=await Promise.all([call(route,auth,payload(id)),call(route,auth,payload(id))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(stored('product:'+id).stock,0);
 const idem='idem-'+route;await call('product',owner,product(idem,5));const body=payload(idem);
 const twice=await Promise.all([call(route,auth,body),call(route,auth,body)]);
 assert.deepEqual(twice.map(r=>r.status),[200,200]);assert.equal(twice[0].data.id,twice[1].data.id);assert.equal(stored('product:'+idem).stock,4);
 const duplicate=await call(route,auth,{...payload(idem),items:[{id:idem,quantity:3},{id:idem,quantity:3}]});assert.equal(duplicate.status,400);
 const rollback='rollback-'+route;await call('product',owner,product(rollback,2));const rollbackBody=payload(rollback);failBatchAt=1;
 assert.equal((await call(route,auth,rollbackBody)).status,503);failBatchAt=-1;
 assert.equal(stored('product:'+rollback).stock,2);assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE kind='order' AND id LIKE ?").get('%'+rollbackBody.key).n,0);
 assert.equal((await call(route,auth,rollbackBody)).status,200);assert.equal(stored('product:'+rollback).stock,1);
}
await call('product',owner,product('image',4));assert.equal(stored('product:image').image,'/dish.jpg');
const official=menuExports.officialMenuProducts[0];await call('product',owner,{...official,desc:'Правка кафе',image:'/custom.jpg',cat:'Категория кафе',stock:7});await call('menu');assert.equal(stored('product:'+official.id).desc,'Правка кафе');assert.equal(stored('product:'+official.id).image,'/custom.jpg');assert.equal(stored('product:'+official.id).cat,'Категория кафе');
assert.equal((await call('product',owner,{...product('image',7),expectedStock:3})).status,409);assert.equal(stored('product:image').stock,4);
assert.equal((await call('stock',owner,{id:'image',stock:8,expectedStock:3})).status,409);
assert.equal((await call('pos',staff)).data.summary.revenue,0);
assert.equal((await call('payment',customer,{id:first.data.id,payment:'cash'})).status,403);
assert.equal((await call('payment',staff,{id:first.data.id,payment:'cash'})).status,200);
const paidAt=stored(first.data.id).paidAt;assert.equal((await call('payment',staff,{id:first.data.id,payment:'cash'})).status,200);assert.equal(stored(first.data.id).paidAt,paidAt);assert.equal((await call('pos',staff)).data.summary.revenue,1000);
console.log('PASS: customer/POS concurrent last unit, simultaneous retries, duplicate lines, transaction rollback/retry, image/edit preservation, stale inventory edits, payment authorization and revenue. No production data changed.');

for(let i=0;i<205;i++)db.prepare('INSERT INTO records (id,kind,owner,data,created) VALUES (?,?,?,?,?)').run('history:'+String(i).padStart(3,'0'),'order','tg:22',JSON.stringify({items:[],status:'Новый'}),42);
const historyUser=await signed(22);let allHistory=[],before='';for(let i=0;i<3;i++){const page=await call('orders'+before,historyUser);assert.equal(page.status,200);allHistory.push(...page.data);const last=page.data.at(-1);before='?before='+encodeURIComponent(JSON.stringify({created:last.created,id:last.id}));}assert.equal(allHistory.length,205);assert.equal(new Set(allHistory.map(o=>o.id)).size,205);assert.equal((await call('orders?before=bad',historyUser)).status,400);
console.log('PASS: history pagination across equal timestamps, no missing or duplicated rows.');

const originalSettings=stored('settings');await call('accepting',owner,{accepting:false});
assert.equal((await call('menu')).data.settings.accepting,false);assert.equal((await call('orders',customer,{...order,key:crypto.randomUUID()})).status,409);await call('menu');assert.equal(stored('settings').accepting,false);
await call('accepting',owner,{accepting:true});assert.equal((await call('menu')).data.settings.accepting,true);
console.log('PASS: reopening migration runs once, STOP persists across requests, open cart cannot bypass STOP, resume works.');

// Delivery validation, unified catalog, staff/owner boundaries, persistent STOP.
assert.equal((await call('accepting',customer,{accepting:false})).status,403);
const beforeStop=stored('settings');await call('accepting',staff,{accepting:false});
assert.deepEqual({...stored('settings'),accepting:beforeStop.accepting},beforeStop);
await call('settings',owner,{...beforeStop,accepting:true});assert.equal(stored('settings').accepting,false);
await call('accepting',staff,{accepting:true});
await call('settings',owner,{...stored('settings'),deliveryEnabled:true,zone:'Тестовая зона',fee:100,minimum:0});
await call('product',owner,product('delivery',50));
const deliveryOrder={...payload('delivery'),delivery:'delivery'};
let missing=await call('orders',customer,{...deliveryOrder,deliveryDetails:{type:'mall',mall:' ',pavilion:' ',street:' ',house:' '}});
assert.equal(missing.status,400);assert.deepEqual(Object.keys(missing.data.fields).sort(),['house','mall','pavilion','street']);
missing=await call('orders',customer,{...deliveryOrder,deliveryDetails:{type:'house',street:' ',house:' '}});assert.equal(missing.status,400);
const delivered=await call('orders',customer,{...deliveryOrder,deliveryDetails:{type:'mall',mall:' Тест ',pavilion:' 4 ',street:' Полевая ',house:' 6 ',apartment:'ignored'}});assert.equal(delivered.status,200);assert.equal(delivered.data.total,600);assert.equal(delivered.data.deliveryDetails.apartment,undefined);assert.equal(delivered.data.deliveryDetails.mall,'Тест');
const home=await call('orders',customer,{...deliveryOrder,key:crypto.randomUUID(),deliveryDetails:{type:'house',street:'Полевая',house:'6',apartment:'2',mall:'ignored'}});assert.equal(home.status,200);assert.equal(home.data.deliveryDetails.mall,undefined);
const pickup=await call('orders',customer,{...payload('delivery'),deliveryDetails:{type:'mall',street:' '}});assert.equal(pickup.status,200);assert.equal(pickup.data.deliveryDetails,null);
await call('product',owner,{...product('salad-normalize',10),cat:'Салаты и закуски'});
await call('product',owner,{...product('khinkal-normalize',10),name:'Хинкал тест',cat:'Блюда из теста'});
const menu=await call('menu'),pos=await call('pos',staff);assert.deepEqual(menu.data.products,pos.data.products);assert.deepEqual(menu.data.categories,pos.data.categories);assert.equal(menu.data.products.find(p=>p.id==='salad-normalize').cat,'Салаты');assert.equal(menu.data.products.find(p=>p.id==='khinkal-normalize').cat,'Хинкал');
for(const c of menu.data.categories.filter(c=>c.name!=='Обеды'&&c.name!=='Категория кафе'))assert.ok(fs.existsSync('public'+c.image));
const beforeProcessing=stored('product:delivery').stock,revBefore=(await call('pos',staff)).data.summary.revenue;
await Promise.all([call('process',staff,{id:home.data.id}),call('process',telegramOwner,{id:home.data.id})]);assert.equal(stored('product:delivery').stock,beforeProcessing);assert.equal((await call('pos',staff)).data.summary.revenue,revBefore);
await Promise.all([call('payment',staff,{id:home.data.id,payment:'card'}),call('payment',telegramOwner,{id:home.data.id,payment:'card'})]);assert.equal((await call('pos',staff)).data.summary.revenue,revBefore+home.data.total);
assert.equal((await call('stock',staff,{id:'delivery',stock:100})).status,403);assert.equal((await call('settings',staff,stored('settings'))).status,403);
const sorted=(await call('orders?all=1',staff)).data;let sawProcessed=false;for(const o of sorted){if(o.status!=='Новый')sawProcessed=true;else assert.equal(sawProcessed,false);}
console.log('PASS: structured mall/home/pickup validation, trimmed fields, irrelevant fields discarded, unified categories/assets/catalog, simultaneous processing/payment, STOP permissions and settings isolation.');

// Queue and mock Telegram: never sends real café messages.
const noticeCount=id=>db.prepare("SELECT count(*) n FROM records WHERE id=? AND kind='notification'").get('notice:'+id).n;
assert.equal(noticeCount(home.data.id),1);assert.equal((await call('notifications/retry',customer,{})).status,403);
assert.equal((await call('service-state',staff)).data.notifications.configured,false);
// Mark older test notices sent, so each transport case has one isolated target.
db.prepare("UPDATE records SET data=json_set(data,'$.status','sent') WHERE kind='notification'").run();
testEnv.TELEGRAM_BOT_TOKEN='test-token';testEnv.TELEGRAM_ORDERS_CHAT_ID='-123';let sends=0;
sendMock=async()=>{sends++;return Response.json({ok:true,result:{message_id:100+sends}});};
const sent=await call('orders',customer,payload('delivery'));await Promise.all(background.splice(0));assert.equal(stored('notice:'+sent.data.id).status,'sent');assert.equal(sends,1);
await Promise.all([call('notifications/retry',staff,{}),call('notifications/retry',staff,{})]);assert.equal(sends,1);
sendMock=async()=>{sends++;return Response.json({ok:false,error_code:429,parameters:{retry_after:60}});};
const retry=await call('orders',customer,payload('delivery'));await Promise.all(background.splice(0));assert.equal(stored('notice:'+retry.data.id).status,'pending');assert.ok(stored('notice:'+retry.data.id).nextTry>Date.now());
sendMock=async()=>{sends++;throw Error('Timed out after possible delivery');};
const uncertain=await call('orders',customer,payload('delivery'));await Promise.all(background.splice(0));assert.equal(stored('notice:'+uncertain.data.id).status,'uncertain');const sendCount=sends;await call('notifications/retry',staff,{});assert.equal(sends,sendCount);
sendMock=async()=>{sends++;return Response.json({ok:true,result:{message_id:999}});};
await call('notifications/retry',staff,{orderId:uncertain.data.id,confirmUncertain:true});assert.equal(stored('notice:'+uncertain.data.id).status,'sent');
assert.equal((await call('notifications/tick',{},{})).status,403);
console.log('PASS: atomic durable notification per order, missing config, success, 429 backoff, ambiguous delivery without blind duplicate, authorized retry, scheduler protection. Mock transport only.');
assert.equal((await call('orders-state',customer,{ids:[home.data.id]})).status,403);assert.equal((await call('orders-state',staff,{ids:[home.data.id]})).data[0].paymentStatus,'paid');
// Simulate STOP committing after validation but before the atomic order transaction.
testEnv.TELEGRAM_BOT_TOKEN='';await call('accepting',staff,{accepting:true});const originalBatch=binding.batch;let intercept=true;
binding.batch=async function(statements){if(intercept){intercept=false;db.prepare("UPDATE records SET data=json_set(data,'$.accepting',json('false')) WHERE id='settings'").run();}return originalBatch.call(this,statements);};
const stockBeforeRace=stored('product:delivery').stock;const stoppedInFlight=await call('orders',customer,payload('delivery'));assert.equal(stoppedInFlight.status,409);assert.equal(stored('product:delivery').stock,stockBeforeRace);binding.batch=originalBatch;
await call('accepting',owner,{accepting:true});
let staffPages=[],staffCursor='';for(let i=0;i<5;i++){const page=(await call('orders?all=1'+staffCursor,staff)).data;staffPages.push(...page);if(page.length<200)break;const last=page.at(-1);staffCursor='&before='+encodeURIComponent(JSON.stringify({id:last.id,created:last.created,status:last.status}));}assert.equal(new Set(staffPages.map(o=>o.id)).size,staffPages.length);assert.equal(staffPages.length,db.prepare("SELECT count(*) n FROM records WHERE kind='order'").get().n);
console.log('PASS: older order state permissions, STOP/order transaction race, staff pagination across new and processed groups.');

// Report fixtures are isolated from production and from earlier test orders.
db.prepare("DELETE FROM records WHERE kind='order'").run();
const day=86400000, todayRange=reportExports.reportPeriod(new URLSearchParams('period=today'));
const insertReport=(id,created,extra={})=>db.prepare('INSERT INTO records(id,kind,owner,data,created) VALUES(?,?,?,?,?)').run(id,'order','tg:1',JSON.stringify({number:id,items:[],status:'Новый',paymentStatus:'unpaid',payment:'cash',total:100,source:'miniapp',...extra}),created);
const reports=async(query='kind=orders&period=today',auth=staff)=>call('staff-report?'+query,auth);
assert.equal((await reports('',customer)).status,403);assert.equal((await reports('',{})).status,401);
for(const [preset,days] of [['today',1],['yesterday',1],['week',7],['month',30]]){const p=reportExports.reportPeriod(new URLSearchParams({period:preset}));assert.equal(p.end-p.start,days*day);if(preset==='yesterday')assert.equal(p.end,todayRange.start);else assert.equal(p.end,todayRange.end);}
for(const query of ['period=bad','period=custom&from=2026-02-30&to=2026-03-01','period=custom&from=2026-03-02&to=2026-03-01','period=custom&from=2026-03-01'])assert.equal((await reports(query)).status,400);
const custom=reportExports.reportPeriod(new URLSearchParams('period=custom&from=2026-01-15&to=2026-01-15'));
assert.equal(custom.start,Date.parse('2026-01-14T21:00:00Z'));assert.equal(custom.end,Date.parse('2026-01-15T21:00:00Z'));
insertReport('before',custom.start-1);insertReport('first-ms',custom.start);insertReport('last-ms',custom.end-1);insertReport('after',custom.end);
assert.deepEqual((await reports('period=custom&from=2026-01-15&to=2026-01-15')).data.rows.map(o=>o.id).sort(),['first-ms','last-ms']);
insertReport('yesterday-paid-today',todayRange.start-1,{paidAt:todayRange.start,paymentStatus:'paid',total:450});
insertReport('today-unpaid',todayRange.start,{total:999});
insertReport('cancelled-paid',todayRange.start,{status:'Отменён',paymentStatus:'paid',paidAt:todayRange.start,total:999});
for(let i=0;i<123;i++)insertReport('report:'+String(i).padStart(3,'0'),todayRange.start,{source:i%2?'counter':'miniapp',paymentStatus:'paid',paidAt:todayRange.start,payment:i%2?'card':'cash',total:100,status:i<60?'Новый':'Обработан'});
const rev=(await reports('kind=revenue&period=today')).data;
assert.equal(rev.summary.count,124);assert.equal(rev.summary.total,12750);assert.equal(rev.summary.cash+rev.summary.card,rev.summary.total);assert.equal(rev.summary.card,6100);assert.equal(rev.rows.length,50);assert.ok(rev.next);
let revRows=[],cursor=null;do{const r=(await reports('kind=revenue&period=today'+(cursor?'&cursor='+encodeURIComponent(JSON.stringify(cursor)):''))).data;assert.equal(r.summary.total,12750);revRows.push(...r.rows);cursor=r.next;}while(cursor);
assert.equal(revRows.length,124);assert.equal(new Set(revRows.map(o=>o.id)).size,124);assert.ok(revRows.some(o=>o.id==='yesterday-paid-today'));assert.ok(!revRows.some(o=>o.id==='today-unpaid'));
const posSummary=(await call('pos',staff)).data.summary;assert.equal(posSummary.revenue,12750);assert.equal(posSummary.orders,125);
const reportFirst=(await reports()).data;assert.ok(!reportFirst.rows.some(o=>o.id==='yesterday-paid-today'));
const moving=reportFirst.rows[0];await call('process',staff,{id:moving.id});
const processedTime=stored(moving.id).processedAt;await call('process',staff,{id:moving.id});assert.equal(stored(moving.id).processedAt,processedTime);
let paged=[...reportFirst.rows],orderCursor=reportFirst.next;while(orderCursor){const r=(await reports('period=today&cursor='+encodeURIComponent(JSON.stringify(orderCursor)))).data;paged.push(...r.rows);orderCursor=r.next;}
assert.equal(paged.length,125);assert.equal(new Set(paged.map(o=>o.id)).size,125);
assert.equal((await reports('period=yesterday&cursor='+encodeURIComponent(JSON.stringify(reportFirst.next)))).status,400);
await Promise.all([call('payment',staff,{id:'today-unpaid',payment:'card'}),call('payment',owner,{id:'today-unpaid',payment:'cash'})]);
const originalPaidAt=stored('today-unpaid').paidAt;await call('payment',staff,{id:'today-unpaid',payment:'card'});assert.equal(stored('today-unpaid').paidAt,originalPaidAt);
const finalRevenue=(await reports('kind=revenue&period=today')).data.summary;assert.equal(finalRevenue.total,13749);assert.equal(finalRevenue.count,125);assert.equal(finalRevenue.cash+finalRevenue.card,finalRevenue.total);
console.log('PASS: report permissions; all date presets; Moscow midnight and inclusive end; invalid dates; created yesterday/paid today; unpaid excluded; full-database totals beyond 50 rows; stable pages during processing; concurrent payment exactly once with original timestamp.');
