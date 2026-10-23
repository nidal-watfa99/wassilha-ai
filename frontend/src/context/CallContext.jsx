/* WebRTC call controller.
   Signaling rides the authenticated WebSocket (see RealtimeContext).
   Every terminal path (hangup, decline, remote end, socket loss, unmount)
   stops local tracks, closes the peer connection and resets state - no leaks. */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { LOCAL_MODE, api } from "../services/api";
import { useApp } from "./AppContext";
import { useRealtime } from "./RealtimeContext";

const CallCtx = createContext(null);

const IDLE = { status: "idle" };

export function CallProvider({ children }) {
  const { t, toast } = useApp();
  const rt = useRealtime();
  const [call, setCall] = useState(IDLE);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const callIdRef = useRef(null);
  const peerRef = useRef(null);
  const aliveRef = useRef(true);

  const teardown = useCallback((statusText) => {
    aliveRef.current = false;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((tr) => tr.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.getSenders?.().forEach((s) => s.track?.stop?.());
      try { pcRef.current.close(); } catch { /* ignore */ }
      pcRef.current = null;
    }
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    callIdRef.current = null;
    peerRef.current = null;
    setRemoteStream(null);
    setMicOn(true);
    setCamOn(false);
    setCall(statusText ? { status: "ended", text: statusText } : IDLE);
    setTimeout(() => { if (aliveRef.current === false) setCall(IDLE); }, 2500);
  }, []);

  const makePeer = useCallback((peerId, peerName, media) => {
    const pc = new RTCPeerConnection({ iceServers: callCfgRef.current });
    pc.ontrack = (ev) => {
      if (ev.streams?.[0]) setRemoteStream(ev.streams[0]);
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate && callIdRef.current) {
        rt.send({
          type: "call-ice", to: peerRef.current, call_id: callIdRef.current,
          data: { candidate: ev.candidate.toJSON() },
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCall((c) => ({ ...c, status: "connected" }));
      if (pc.connectionState === "failed") {
        toast(t("err_network"), "error");
        rt.send({ type: "call-end", to: peerRef.current, call_id: callIdRef.current, data: {} });
        teardown();
      }
    };
    return pc;
  }, [rt, t, toast, teardown]);

  // ICE server config fetched once per call start
  const callCfgRef = useRef([{ urls: "stun:stun.l.google.com:19302" }]);
  useEffect(() => {
    api.get("/config/webrtc")
      .then((d) => { if (d.iceServers?.length) callCfgRef.current = d.iceServers; })
      .catch(() => {});
  }, []);

  const getMedia = useCallback(async (media) => {
    const audio = { audio: true };
    const video = media === "video" ? { video: { width: { ideal: 1280 } } } : false;
    const stream = await navigator.mediaDevices.getUserMedia({ ...audio, ...(video ? video : {}) });
    localStreamRef.current = stream;
    return stream;
  }, []);

  // ---- outgoing ----
  const startCall = useCallback(async (peerId, peerName, media = "audio") => {
    if (LOCAL_MODE) {
      toast(t("callLocalOnly"), "error");
      return;
    }
    if (!window.RTCPeerConnection) {
      toast(t("callUnavailable"), "error");
      return;
    }
    aliveRef.current = true;
    peerRef.current = peerId;
    callIdRef.current = crypto.randomUUID();
    setCall({ status: "calling", peerName, media, callId: callIdRef.current });
    try {
      const stream = await getMedia(media);
      const pc = makePeer(peerId, peerName, media);
      pcRef.current = pc;
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const ok = rt.send({
        type: "call-offer", to: peerId, call_id: callIdRef.current,
        data: { media, sdp: { type: offer.type, sdp: offer.sdp } },
      });
      if (!ok) throw { code: "network" };
      setCamOn(media === "video");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        toast(media === "video" ? t("camDenied") : t("micDenied"), "error");
      } else if (err.code !== "network") {
        toast(t("err_unknown"), "error");
      } else {
        toast(t("err_network"), "error");
      }
      teardown();
    }
  }, [getMedia, makePeer, rt, t, toast, teardown]);

  // ---- incoming ----
  const acceptCall = useCallback(async () => {
    const c = call;
    if (c.status !== "ringing" || !c.sdp) return;
    try {
      const stream = await getMedia(c.media);
      const pc = makePeer(c.peerId, c.peerName, c.media);
      pcRef.current = pc;
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(c.sdp));
      remoteDescSetRef.current = true;
      // flush ICE candidates that arrived before the remote description
      for (const cand of pendingIceRef.current) {
        try { await pc.addIceCandidate(cand); } catch { /* ignore */ }
      }
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      rt.send({
        type: "call-answer", to: c.peerId, call_id: c.callId,
        data: { sdp: { type: answer.type, sdp: answer.sdp } },
      });
      setCamOn(c.media === "video");
      setCall({ ...c, status: "connecting" });
    } catch (err) {
      if (err?.name === "NotAllowedError") toast(t("micDenied"), "error");
      else toast(t("err_unknown"), "error");
      rt.send({ type: "call-end", to: c.peerId, call_id: c.callId, data: {} });
      teardown();
    }
  }, [call, getMedia, makePeer, rt, t, toast, teardown]);

  const declineCall = useCallback(() => {
    const c = call;
    if (c.status === "ringing" && c.peerId) {
      rt.send({ type: "call-end", to: c.peerId, call_id: c.callId, data: {} });
    }
    teardown();
  }, [call, rt, teardown]);

  const endCall = useCallback(() => {
    if (peerRef.current && callIdRef.current) {
      rt.send({ type: "call-end", to: peerRef.current, call_id: callIdRef.current, data: {} });
    }
    teardown();
  }, [rt, teardown]);

  // ---- controls ----
  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((tr) => (tr.enabled = next));
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((tr) => (tr.enabled = next));
    setCamOn(next);
  }, [camOn]);

  // ---- signaling handlers ----
  useEffect(() => {
    const subs = [
      rt.subscribe("incoming-call", (p) => {
        peerRef.current = p.from;
        callIdRef.current = p.call_id;
        setCall({
          status: "ringing", peerName: p.from_name, peerId: p.from,
          media: p.media || "audio", callId: p.call_id, sdp: p.sdp,
        });
      }),
      rt.subscribe("call-answer", async (p) => {
        const pc = pcRef.current;
        if (!pc || p.call_id !== callIdRef.current) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(p.data.sdp));
          remoteDescSetRef.current = true;
          for (const cand of pendingIceRef.current) {
            try { await pc.addIceCandidate(cand); } catch { /* ignore */ }
          }
          pendingIceRef.current = [];
          setCall((c) => ({ ...c, status: "connecting" }));
        } catch { teardown(); }
      }),
      rt.subscribe("call-ice", async (p) => {
        const pc = pcRef.current;
        if (!pc || p.call_id !== callIdRef.current) return;
        const cand = p.data?.candidate;
        if (!cand) return;
        if (remoteDescSetRef.current) {
          try { await pc.addIceCandidate(cand); } catch { /* ignore */ }
        } else {
          pendingIceRef.current.push(cand);
        }
      }),
      rt.subscribe("call-end", (p) => {
        if (p.call_id !== callIdRef.current) return;
        teardown();
      }),
      rt.subscribe("error", (p) => {
        if (p.detail === "cannot_call_user") toast(t("err_cannot_call_user"), "error");
      }),
    ];
    return () => subs.forEach((un) => un());
  }, [rt, t, toast, teardown]);

  // socket lost mid-call -> end
  useEffect(() => {
    if (!rt.online && call.status !== "idle" && call.status !== "ended") teardown();
  }, [rt.online, call.status, teardown]);

  const value = useMemo(
    () => ({ call, remoteStream, micOn, camOn, startCall, acceptCall, declineCall, endCall, toggleMic, toggleCam, localStreamRef }),
    [call, remoteStream, micOn, camOn, startCall, acceptCall, declineCall, endCall, toggleMic, toggleCam],
  );
  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  return useContext(CallCtx);
}
