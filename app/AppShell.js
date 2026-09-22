"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import InvoiceTabRouter from "./InvoiceTabRouter";
import TTCDisplayEnhancer from "./TTCDisplayEnhancer";
import PersonnelDailyCost from "./PersonnelDailyCost";
import PersonnelManager from "./PersonnelManager";
import VatFloatingButton from "./VatFloatingButton";
import DirectionFinanceChart from "./DirectionFinanceChart";
import DirectionVatSummary from "./DirectionVatSummary";
import OpeningCalendar from "./OpeningCalendar";

const sb = createClient(
  "https://ldwgsogeqreywbqulqyj.supabase.co",
  "sb_publishable_heJuVcHJZcNkQm2w5Q2dIA_bUTPZTOE",
);

const isPublicPage = (pathname) => (
  pathname === "/reservation" ||
  pathname.startsWith("/reservation/") ||
  pathname === "/equipe" ||
  pathname.startsWith("/equipe/")
);

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState({ loading: true, user: null, profile: null });

  useEffect(() => {
    let alive = true;

    async function resolveAccess() {
      const { data } = await sb.auth.getUser();
      const user = data?.user || null;
      if (!user) {
        if (alive) setAccess({ loading: false, user: null, profile: null });
        return;
      }

      const { data: profile } = await sb
        .from("profiles")
        .select("user_id,full_name,role,establishment_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (alive) setAccess({ loading: false, user, profile: profile || null });
    }

    resolveAccess();
    const { data: { subscription } } = sb.auth.onAuthStateChange(() => {
      window.setTimeout(resolveAccess, 0);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const reservationStaff = access.profile?.role === "reservation_staff";
  const management = ["direction", "administratif"].includes(access.profile?.role);
  const staffOnForbiddenPage = reservationStaff && pathname !== "/reservations" && !isPublicPage(pathname);

  useEffect(() => {
    if (!access.loading && staffOnForbiddenPage) router.replace("/reservations");
  }, [access.loading, staffOnForbiddenPage, router]);

  if ((access.loading && !isPublicPage(pathname)) || staffOnForbiddenPage) {
    return <main><section><div className="formCard"><p>Ouverture de l’espace Réservations…</p></div></section></main>;
  }

  return (
    <>
      {management && <>
        <InvoiceTabRouter />
        <TTCDisplayEnhancer />
        <PersonnelDailyCost />
        <PersonnelManager />
        <DirectionFinanceChart />
        <DirectionVatSummary />
        <OpeningCalendar />
      </>}
      {children}
      {management && pathname !== "/reservations" && <VatFloatingButton />}
    </>
  );
}
