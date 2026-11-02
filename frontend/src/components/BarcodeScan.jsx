import React, { useEffect, useRef, useState } from "react";
import { Modal } from "./UI";
import { useApp } from "../context/AppContext";

/* Camera barcode reading uses the browser's BarcodeDetector (Chrome on Android). A USB / Bluetooth scanner needs nothing: it types the code and presses Enter. */
export const canScan = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export default function BarcodeScan({ onCode, onClose }) {
  const { t } = useApp();
  const video = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stop = false, stream, timer;
    (async () => {
      try {
        const det = new window.BarcodeDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.current.srcObject = stream; await video.current.play();
        const tick = async () => {
          if (stop) return;
          try { const r = await det.detect(video.current); if (r.length) { onCode(r[0].rawValue); onClose(); return; } } catch { /* keep trying */ }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch { setErr(t("bc_err")); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((x) => x.stop()); };
  }, []); // eslint-disable-line
  return (
    <Modal title={t("bc_title")} onClose={onClose}>
      <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 12, background: "#000" }} />
      {err && <p style={{ color: "#ff8a9b" }}>{err}</p>}
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{t("bc_hint")}</p>
    </Modal>
  );
}
