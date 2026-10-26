export const restaurants = {
  villa: { name: 'Villa Valleyre', establishmentId: '8395bf22-99cb-4a7b-9096-ca734d583d83', email: 'contact@villavalleyre.fr', site: 'https://www.villavalleyre.fr/', phone: '09 82 37 15 70' },
  parc: { name: 'La Maison du Parc', establishmentId: '55c6e880-aa0c-40d6-9065-b5315b1a602a', email: 'contact@lamaisonduparc-salles.fr', site: 'https://www.lamaisonduparc-salles.fr/', phone: '05 35 75 82 10' },
};
export const occasions = ['Repas de famille ou entre amis', 'Anniversaire', 'Mariage ou réception privée', 'Repas d’entreprise', 'Séminaire ou réunion', 'Association', 'Privatisation', 'Autre événement'];
export function validateEnquiry(body, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())) {
  const clean = (key, max = 150) => String(body[key] ?? '').trim().slice(0, max);
  const data = {
    restaurant: clean('restaurant'), event_date: clean('event_date', 10), start_time: clean('start_time', 5), end_time: clean('end_time', 5),
    flexibility: clean('flexibility'), guests: Number(body.guests), occasion: clean('occasion'), full_name: clean('full_name'),
    company: clean('company'), email: clean('email', 254).toLowerCase(), phone: clean('phone', 40), budget: clean('budget', 120), message: clean('message', 4000),
  };
  const errors = {};
  if (!Object.hasOwn(restaurants, data.restaurant)) errors.restaurant = 'Choisissez un restaurant.';
  const date = new Date(`${data.event_date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.event_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.event_date || data.event_date < today) errors.event_date = 'Choisissez une date à venir.';
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(data.start_time)) errors.start_time = 'Indiquez l’heure de début.';
  if (data.end_time && !time.test(data.end_time)) errors.end_time = 'Vérifiez l’heure de fin.';
  if (data.end_time && data.end_time <= data.start_time) errors.end_time = 'La fin doit être après le début. Pour une fin après minuit, précisez-la dans votre message.';
  if (!Number.isInteger(data.guests) || data.guests < 1 || data.guests > 1000) errors.guests = 'Indiquez entre 1 et 1 000 personnes. La capacité sera confirmée par notre équipe.';
  if (!['Date fixe', 'Quelques jours', 'À discuter'].includes(data.flexibility)) errors.flexibility = 'Précisez si vos dates sont flexibles.';
  if (!occasions.includes(data.occasion)) errors.occasion = 'Choisissez votre type d’événement.';
  if (data.full_name.length < 2) errors.full_name = 'Indiquez votre nom et prénom.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || /[\r\n]/.test(data.email)) errors.email = 'Vérifiez votre adresse e-mail.';
  if (data.phone.replace(/\D/g, '').length < 8) errors.phone = 'Vérifiez votre numéro de téléphone.';
  if (body.privacy !== true) errors.privacy = 'Merci d’accepter le traitement de votre demande.';
  return { data, errors, valid: Object.keys(errors).length === 0 };
}
