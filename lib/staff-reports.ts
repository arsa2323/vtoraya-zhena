export class ReportInputError extends Error {}
const DAY=86400000, MOSCOW=10800000;
const dateString=(time:number)=>new Date(time+MOSCOW).toISOString().slice(0,10);
export function reportPeriod(params:URLSearchParams,now=Date.now()){
 const preset=params.get('period')||'today';let from='',to='';
 if(preset==='all')return {preset,from,to,start:0,end:8640000000000000};
 const today=dateString(now);
 if(preset==='custom'){from=params.get('from')||'';to=params.get('to')||'';}
 else if(preset==='today')from=to=today;
 else if(preset==='yesterday')from=to=dateString(now-DAY);
 else if(preset==='week'){from=dateString(now-6*DAY);to=today;}
 else if(preset==='month'){from=dateString(now-29*DAY);to=today;}
 else throw new ReportInputError('Выберите корректный период');
 const parse=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new ReportInputError('Укажите обе даты');const t=Date.parse(value+'T00:00:00+03:00');if(!Number.isFinite(t)||dateString(t)!==value)throw new ReportInputError('Некорректная дата');return t;};
 const start=parse(from),end=parse(to)+DAY;
 if(start>=end)throw new ReportInputError('Дата «С» должна быть не позже даты «По»');
 return {preset,from,to,start,end};
}

export async function staffReport(db:D1Database,params:URLSearchParams,summaryOnly=false){
 const kind=params.get('kind')||'orders',status=params.get('status')||'all';
 if(!['orders','revenue'].includes(kind)||!['all','new','done'].includes(status))throw new ReportInputError('Некорректный фильтр');
 const period=reportPeriod(params),fingerprint=JSON.stringify([kind,status,period.from,period.to]);
 let cursor:any=null;if(params.has('cursor')){try{cursor=JSON.parse(params.get('cursor')!);}catch{throw new ReportInputError('Некорректная страница');}}
 if(cursor&&(!Number.isSafeInteger(cursor.snapshot)||cursor.snapshot<0||cursor.snapshot>Date.now()+1000||!Number.isSafeInteger(cursor.time)||typeof cursor.id!=='string'||cursor.id.length>250||![0,1].includes(cursor.rank)||cursor.filter!==fingerprint))throw new ReportInputError('Страница не соответствует выбранному периоду');
 const snapshot=cursor?.snapshot??Date.now(),paid="json_extract(data,'$.paidAt')";
 // processedAt freezes grouping while pages are loaded, even if another employee accepts an order.
 const rank=kind==='orders'?`CASE WHEN json_extract(data,'$.status')='Новый' OR COALESCE(json_extract(data,'$.processedAt'),0)>=${snapshot} THEN 1 ELSE 0 END`:'0';
 const time=kind==='orders'?'created':paid;
 const conditions=["kind='order'",`${time}>=?`,`${time}<?`,`${time}<=?`],args:(number|string)[]=[period.start,period.end,snapshot];
 if(kind==='revenue')conditions.push("json_extract(data,'$.paymentStatus')='paid'","COALESCE(json_extract(data,'$.status'),'')!='Отменён'");
 if(kind==='orders'&&status!=='all')conditions.push(status==='new'?`(${rank})=1`:`(${rank})=0 AND json_extract(data,'$.status')='Обработан'`);
 const where=conditions.join(' AND ');
 const summary=await db.prepare(`SELECT count(*) AS count,COALESCE(sum(CASE WHEN json_extract(data,'$.status')='Новый' THEN 1 ELSE 0 END),0) AS newCount,COALESCE(sum(json_extract(data,'$.total')),0) AS total,COALESCE(sum(CASE WHEN json_extract(data,'$.payment')='cash' THEN json_extract(data,'$.total') ELSE 0 END),0) AS cash,COALESCE(sum(CASE WHEN json_extract(data,'$.payment')='card' THEN json_extract(data,'$.total') ELSE 0 END),0) AS card FROM records WHERE ${where}`).bind(...args).first();
 if(summaryOnly)return {period,summary,rows:[],next:null};
 if(cursor){conditions.push(`((${rank})<? OR ((${rank})=? AND (${time}<? OR (${time}=? AND id<?))))`);args.push(cursor.rank,cursor.rank,cursor.time,cursor.time,cursor.id);}
 const result=await db.prepare(`SELECT id,data,created,${time} AS sortTime,(${rank}) AS groupRank,(SELECT json_extract(n.data,'$.status') FROM records n WHERE n.id='notice:'||records.id) AS notificationStatus FROM records WHERE ${conditions.join(' AND ')} ORDER BY groupRank DESC,sortTime DESC,id DESC LIMIT 51`).bind(...args).all<{id:string,data:string,created:number,sortTime:number,groupRank:number,notificationStatus:string}>();
 const page=result.results.slice(0,50),last=page.at(-1);
 return {period,summary,rows:page.map(r=>({id:r.id,...JSON.parse(r.data),created:r.created,commitToken:undefined,notificationStatus:r.notificationStatus})),next:result.results.length>50&&last?{snapshot,time:last.sortTime,id:last.id,rank:last.groupRank,filter:fingerprint}:null};
}
