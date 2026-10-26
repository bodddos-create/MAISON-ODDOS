'use client';
import { useEffect, useRef, useState } from 'react';
import { restaurants, occasions, validateEnquiry } from '../../lib/group-enquiries.mjs';
import './style.css';
const blank = { restaurant: '', event_date: '', start_time: '', end_time: '', flexibility: 'Date fixe', guests: '', occasion: '', full_name: '', company: '', email: '', phone: '', budget: '', message: '', privacy: false, website: '' };
export default function Groupes() {
  const [form, setForm] = useState(blank), [step, setStep] = useState(1), [embedded, setEmbedded] = useState(false), [errors, setErrors] = useState({}), [busy, setBusy] = useState(false), [result, setResult] = useState(null), [alert, setAlert] = useState('');
  const identity = useRef(null), started = useRef(Date.now()), heading = useRef(null);
  const [today, setToday] = useState('');
  const restaurant = restaurants[form.restaurant];
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmbedded(params.get('embed') === '1');
    if (Object.hasOwn(restaurants, params.get('restaurant'))) setForm(f => ({ ...f, restaurant: params.get('restaurant') }));
    identity.current = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
    setToday(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()));
    document.title = 'Groupes & privatisation · Maison Oddos';
  }, []);
  useEffect(() => { if (step === 2 || result) heading.current?.focus(); }, [step, result]);
  const update = e => { const { name, value, type, checked } = e.target; setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value })); setErrors(x => ({ ...x, [name]: '' })); setAlert(''); };
  const err = name => errors[name] ? <span className="ge-field-error" id={`error-${name}`}>{errors[name]}</span> : null;
  const attrs = name => ({ name, value: form[name], onChange: update, onInput: update, 'aria-invalid': !!errors[name], 'aria-describedby': errors[name] ? `error-${name}` : undefined });
  function next(e) {
    e.preventDefault();
    const checked = validateEnquiry(form, today).errors;
    const eventErrors = Object.fromEntries(Object.entries(checked).filter(([key]) => ['restaurant','event_date','start_time','end_time','flexibility','guests'].includes(key)));
    setErrors(eventErrors);
    if (!Object.keys(eventErrors).length) { setStep(2); setAlert(''); }
    else setAlert('Merci de vérifier les champs indiqués.');
  }
  async function send(e) {
    e.preventDefault();
    const checked = validateEnquiry(form, today);
    if (!checked.valid) { setErrors(checked.errors); setAlert('Merci de vérifier les champs indiqués.'); return; }
    setBusy(true); setAlert('');
    try {
      const response = await fetch('/api/groupes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, request_id: identity.current, started_at: started.current }) });
      const data = await response.json();
      if (!response.ok) { setErrors(data.errors || {}); throw new Error(data.error || 'Envoi impossible. Merci de réessayer.'); }
      setResult(data);
    } catch (error) { setAlert(error.message || 'Connexion interrompue. Vos informations sont conservées dans ce formulaire : réessayez.'); }
    finally { setBusy(false); }
  }
  function close() {
    if (embedded) window.parent.postMessage({ type: 'oddos-groupes-close' }, '*');
    else window.location.href = restaurant?.site || restaurants.parc.site;
  }
  return <div className={`ge-page ${embedded ? 'ge-embedded' : ''}`}>
    <section className="ge-dialog" aria-label="Votre demande d’événement">
      <div className="ge-utility"><span className="ge-mark">MAISON ODDOS</span><div>{restaurant && <><a href={`tel:${restaurant.phone.replaceAll(' ', '')}`} aria-label={`Téléphoner à ${restaurant.name}`}>☎</a><a href={`mailto:${restaurant.email}`} aria-label={`Écrire à ${restaurant.name}`}>✉</a></>}<span className="ge-language">FR</span><button type="button" onClick={close} className="ge-close" aria-label="Fermer le formulaire">×</button></div></div>
      {result ? <div className="ge-content ge-success"><span className="ge-eyebrow">VOTRE PROJET COMMENCE ICI</span><h1 ref={heading} tabIndex={-1}>Merci pour votre demande.</h1><p>Votre projet est enregistré pour <strong>{restaurant?.name}</strong>. Notre équipe vous recontactera pour en discuter avec vous.</p><div className="ge-summary"><strong>{form.guests} personnes · {new Date(`${form.event_date}T12:00:00`).toLocaleDateString('fr-FR')}</strong><span>{form.occasion}</span><small>Référence : {result.reference}</small></div><p className="ge-note">Cette demande ne constitue pas une confirmation de réservation.</p><button onClick={close} className="ge-submit">{embedded ? 'Revenir au site' : `Retour au site de ${restaurant?.name}`}</button></div> : <>
        <div className="ge-content">
          <div className="ge-progress" aria-label={`Étape ${step} sur 2`}><span className="active"/><span className={step === 2 ? 'active' : ''}/><small>{step} / 2</small></div>
          <h1 ref={heading} tabIndex={-1}>{step === 1 ? 'Votre demande d’événement' : 'Parlons de votre projet'}</h1>
          <p className="ge-intro">{step === 1 ? 'Un repas de groupe, une belle occasion ou un rendez-vous professionnel… Confiez-nous vos envies pour imaginer votre événement ensemble.' : `Quelques coordonnées pour permettre à l’équipe ${restaurant ? `de ${restaurant.name}` : 'du restaurant'} de vous proposer une expérience sur mesure.`}</p>
          <form id="group-enquiry" onSubmit={step === 1 ? next : send} noValidate className="ge-form">
            <div className="ge-honeypot" aria-hidden="true"><label>Votre site internet<input {...attrs('website')} tabIndex={-1} autoComplete="off"/></label></div>
            {step === 1 ? <>
              <label className="ge-wide">Restaurant souhaité *<select {...attrs('restaurant')} required><option value="">Choisissez votre restaurant</option>{Object.entries(restaurants).map(([id,r]) => <option key={id} value={id}>{r.name}</option>)}</select>{err('restaurant')}</label>
              <label className="ge-wide">Date *<input {...attrs('event_date')} type="date" min={today} required/>{err('event_date')}</label>
              <label>Début *<input {...attrs('start_time')} type="time" required/>{err('start_time')}</label><label>Fin <span className="ge-optional">(facultatif)</span><input {...attrs('end_time')} type="time"/>{err('end_time')}</label>
              <label className="ge-wide">Vos dates sont-elles flexibles ? *<select {...attrs('flexibility')} required><option value="Date fixe">Non, cette date est fixée</option><option value="Quelques jours">Oui, de quelques jours</option><option value="À discuter">Oui, je souhaite en discuter</option></select>{err('flexibility')}</label>
              <label className="ge-wide">Nombre de personnes *<input {...attrs('guests')} type="number" min="1" max="1000" placeholder="Ex. : 25" inputMode="numeric" required/>{err('guests')}</label>
              <p className="ge-note ge-wide">Les disponibilités et la capacité d’accueil vous seront confirmées par notre équipe.</p>
            </> : <>
              <div className="ge-recap ge-wide"><strong>{restaurant?.name}</strong><span>{form.guests} personnes · {new Date(`${form.event_date}T12:00:00`).toLocaleDateString('fr-FR')} · {form.start_time}</span></div>
              <label className="ge-wide">Votre événement *<select {...attrs('occasion')} required><option value="">Choisissez une occasion</option>{occasions.map(o=><option key={o}>{o}</option>)}</select>{err('occasion')}</label>
              <label className="ge-wide">Nom et prénom *<input {...attrs('full_name')} autoComplete="name" maxLength="150" required/>{err('full_name')}</label>
              <label className="ge-wide">Entreprise ou association <span className="ge-optional">(facultatif)</span><input {...attrs('company')} autoComplete="organization" maxLength="150"/></label>
              <label className="ge-wide">E-mail *<input {...attrs('email')} type="email" autoComplete="email" maxLength="254" required/>{err('email')}</label>
              <label className="ge-wide">Téléphone *<input {...attrs('phone')} type="tel" autoComplete="tel" maxLength="40" required/>{err('phone')}</label>
              <label className="ge-wide">Budget envisagé <span className="ge-optional">(facultatif)</span><input {...attrs('budget')} placeholder="Par personne ou pour l’ensemble de l’événement" maxLength="120"/></label>
              <label className="ge-wide">Parlez-nous de vos envies <span className="ge-optional">(facultatif)</span><textarea {...attrs('message')} rows="4" maxLength="4000" placeholder="Repas, ambiance, horaires, privatisation…"/></label>
              <label className="ge-consent ge-wide"><input type="checkbox" name="privacy" checked={form.privacy} onChange={update} required aria-invalid={!!errors.privacy}/><span>J’accepte que mes coordonnées soient utilisées par Maison Oddos et le restaurant choisi pour traiter ma demande et me recontacter. *</span></label>{err('privacy')}
              <p className="ge-note ge-wide">Aucune inscription à une newsletter. Pour exercer vos droits concernant cette demande : {restaurant?.email}. Une réservation sera confirmée uniquement après échange avec notre équipe.</p>
            </>}
            {alert && <div role="alert" className="ge-error ge-wide">{alert} {step === 2 && restaurant && <span>Vous pouvez aussi nous joindre au <a href={`tel:${restaurant.phone.replaceAll(' ','')}`}>{restaurant.phone}</a>.</span>}</div>}
          </form>
        </div>
        <footer className="ge-footer"><button type="button" className="ge-back" disabled={busy} onClick={() => step === 2 ? (setStep(1), setErrors({}),setAlert('')) : close()}>Retour</button><button form="group-enquiry" type="submit" disabled={busy} className="ge-submit">{busy ? 'Envoi en cours…' : step === 1 ? 'Continuer' : 'Envoyer ma demande'}</button></footer>
      </>}
    </section>
  </div>;
}
