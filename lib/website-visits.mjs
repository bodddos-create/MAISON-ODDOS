export const siteOrigins = {
 'https://www.villavalleyre.fr':'villa', 'https://villavalleyre.fr':'villa',
 'https://www.lamaisonduparc-salles.fr':'parc', 'https://lamaisonduparc-salles.fr':'parc',
};
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validVisit(body) { return body?.consent === true && uuid.test(body.session_id || '') && uuid.test(body.event_id || ''); }
export function dayInParis(date=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export function summarize(rows, today=dayInParis()) {
 const shift=(n)=>new Date(Date.parse(today+'T12:00:00Z')-n*86400000).toISOString().slice(0,10);
 return Object.fromEntries(['villa','parc'].map(site=>[site,Object.fromEntries([1,7,30].map(days=>[days,rows.filter(r=>r.site===site&&r.day>=shift(days-1)&&r.day<=today).reduce((a,r)=>({visits:a.visits+Number(r.visits),pageviews:a.pageviews+Number(r.pageviews)}),{visits:0,pageviews:0})]))]));
}
