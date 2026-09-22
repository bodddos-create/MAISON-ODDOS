"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);

export default function EquipeLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function destination(user) {
    const { data: profile } = await sb
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.role === "reservation_staff") return "/reservations";
    if (["direction", "administratif"].includes(profile?.role)) return "/reservations";
    return null;
  }

  useEffect(() => {
    let alive = true;
    sb.auth.getUser().then(async ({ data }) => {
      if (!alive || !data?.user) return;
      const target = await destination(data.user);
      if (target) window.location.replace(target);
    });
    return () => { alive = false; };
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data?.user) {
      setBusy(false);
      setMessage("Adresse e-mail ou mot de passe incorrect.");
      return;
    }
    const target = await destination(data.user);
    if (!target) {
      await sb.auth.signOut();
      setBusy(false);
      setMessage("Ce compte n’a pas accès aux réservations.");
      return;
    }
    window.location.replace(target);
  }

  async function resetPassword() {
    if (!email.trim()) return setMessage("Indiquez votre adresse e-mail.");
    setBusy(true);
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/equipe`,
    });
    setBusy(false);
    setMessage(error
      ? "Impossible d’envoyer le lien pour le moment."
      : "Lien envoyé. Vérifiez votre messagerie.");
  }

  return (
    <main>
      <section>
        <div className="formCard" style={{ maxWidth: 460, margin: "70px auto", padding: 28 }}>
          <div className="brand">MAISON ODDOS</div>
          <h1>Espace équipe</h1>
          <p>Accès réservé à la gestion des réservations.</p>
          <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label>Adresse e-mail
              <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>Mot de passe
              <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button disabled={busy}>{busy ? "Connexion…" : "Accéder aux réservations"}</button>
          </form>
          <button className="secondary" disabled={busy} onClick={resetPassword} style={{ width: "100%", marginTop: 10 }}>Mot de passe oublié</button>
          {message && <p className="message">{message}</p>}
        </div>
      </section>
    </main>
  );
}
