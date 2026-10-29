import React, { useEffect, useState } from "react";
import { getMedia } from "../services/media";

export default function MediaView({ id, type, style }) {
  const [u, setU] = useState(null);
  useEffect(() => {
    let url, off = false;
    getMedia(id).then((b) => { if (b && !off) { url = URL.createObjectURL(b); setU(url); } }).catch(() => {});
    return () => { off = true; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (!u) return <div style={{ ...style, minHeight: 48, background: "rgba(255,255,255,.05)" }} />;
  if (type === "audio") return <audio src={u} controls style={{ width: "100%", ...style }} />;
  if (type === "video") return <video src={u} controls playsInline preload="metadata" style={style} />;
  return <img src={u} alt="" style={style} />;
}
