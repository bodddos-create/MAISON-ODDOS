"use client";
import { useEffect, useRef, useState } from "react";
export default function BonScanner({ onCode, onClose }) {
  const video = useRef(null),
    [message, setMessage] = useState(
      "Autorisez la caméra pour lire le QR code du bon.",
    );
  useEffect(() => {
    let cancelled = false,
      stream,
      controls,
      found = false;
    const stop = () => {
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    const hide = () => {
      if (document.hidden) {
        stop();
        onClose();
      }
    };
    document.addEventListener("visibilitychange", hide);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Caméra indisponible. Ouvrez cette page en HTTPS dans Safari ou Chrome, ou saisissez le code manuellement.",
          );
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stop();
          return;
        }
        setMessage(
          "Placez le QR code du bon dans le cadre. La lecture ne valide pas le cadeau.",
        );
        controls = await new BrowserMultiFormatReader().decodeFromStream(
          stream,
          video.current,
          (result, _error, scanner) => {
            if (cancelled || found || !result) return;
            const code = result.getText().trim().toUpperCase();
            if (!/^LMP-[A-F0-9]{32}$/.test(code)) {
              setMessage(
                "Ce code ne correspond pas à un bon du jeu. Scannez le QR code présent sur le cadeau.",
              );
              return;
            }
            found = true;
            scanner.stop();
            stream?.getTracks().forEach((t) => t.stop());
            onCode(code);
          },
        );
        if (cancelled || found) stop();
      } catch (e) {
        stop();
        if (!cancelled)
          setMessage(
            e instanceof DOMException && e.name === "NotAllowedError"
              ? "Accès caméra refusé. Autorisez-le dans les réglages du navigateur ou fermez pour saisir le code."
              : e instanceof Error
                ? e.message
                : "Impossible de démarrer la caméra. Saisissez le code manuellement.",
          );
      }
    }
    void start();
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [onCode, onClose]);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
      >
        <button className="close" autoFocus onClick={onClose}>
          Fermer ×
        </button>
        <h2 id="scanner-title">Scanner un bon</h2>
        <video
          ref={video}
          muted
          playsInline
          autoPlay
          style={{
            width: "100%",
            maxHeight: 340,
            background: "#222",
            borderRadius: 8,
          }}
        />
        <p role="status">{message}</p>
        <p>
          La caméra sert uniquement à la lecture sur ce téléphone. Aucune vidéo
          n’est enregistrée ni envoyée.
        </p>
      </section>
    </div>
  );
}
