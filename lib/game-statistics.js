export function parisDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}
export function gameStatistics(daily, entries, from, to) {
  const days = new Map();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
    return { days: [], plays: 0, wins: 0, claimed: 0, used: 0, newsletter: 0 };
  const end = new Date(to + 'T12:00:00Z');
  for (let d = new Date(from + 'T12:00:00Z'); d <= end && days.size < 366; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    days.set(day, { day, plays: 0, wins: 0, claimed: 0, used: 0 });
  }
  for (const row of daily) {
    const d = days.get(row.day);
    if (d) { d.plays += Number(row.plays); d.wins += Number(row.wins); }
  }
  let newsletter = 0;
  for (const entry of entries) {
    const claimed = days.get(parisDay(entry.created_at));
    if (claimed) { claimed.claimed++; if (entry.consent) newsletter++; }
    if (entry.used_at) { const used = days.get(parisDay(entry.used_at)); if (used) used.used++; }
  }
  const rows = [...days.values()];
  return { days: rows, newsletter, ...Object.fromEntries(['plays','wins','claimed','used'].map(key => [key, rows.reduce((sum, d) => sum + d[key], 0)])) };
}
