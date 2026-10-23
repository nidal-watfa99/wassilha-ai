/* Centralized API client.
   - Same-origin /api requests; Vite dev server proxies to the backend.
   - Session cookie (HttpOnly) is sent automatically (credentials: include).
   - Mutations carry the X-Requested-With header required by the CSRF guard. */

/* API base: window.__API_BASE__ is set in index.html as a deploy-time
   placeholder that the hosting proxy rewrites (e.g. "port/8000"). The value
   may be a relative path, so it is resolved ONCE against the initial page
   URL — SPA routing later changes location.pathname and must not affect it.
   Unresolved on localhost -> relative /api (Vite dev proxy / same-origin). */
import { localRequest, localFileUrl } from "./localBackend";

/* LOCAL_MODE: static hosting (GitHub Pages) with no server. All data stays in this browser. */
export const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === "1" || import.meta.env.VITE_LOCAL_MODE === "true";

const rawBase = window.__API_BASE__ || "";
const unresolved = !rawBase || rawBase.startsWith("__PORT_");
let baseAbs = rawBase;
if (!unresolved && !/^(https?:)?\/\//.test(rawBase)) {
  baseAbs = new URL(rawBase, document.baseURI).href;
}
const BASE = (unresolved ? "" : baseAbs) + "/api";
/* Cookie sessions for same-origin deployments; the hosted preview iframe is
   sandboxed (no cookie access) and authenticates via the proxy's injected
   X-Visitor-Id header instead, so credentials are omitted there. */
const CREDENTIALS = unresolved ? "include" : "omit";

async function request(method, path, body, opts = {}) {
  if (LOCAL_MODE) return localRequest(method, path, body);
  const headers = { "X-Requested-With": "XMLHttpRequest" };
  let finalBody = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body !== undefined || method !== "GET" ? headers : { "X-Requested-With": "XMLHttpRequest" },
      credentials: CREDENTIALS,
      body: finalBody,
      ...opts,
    });
  } catch {
    throw { code: "network" };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw { code: data.detail || `http_${res.status}`, status: res.status, data };
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  patch: (path, body) => request("PATCH", path, body),
  put: (path, body) => request("PUT", path, body),
  del: (path) => request("DELETE", path),

  // upload with real progress via XHR (fetch cannot report upload progress)
  upload(path, formData, onProgress) {
    if (LOCAL_MODE) {
      return localRequest("POST", path, formData).then((r) => { if (onProgress) onProgress(1); return r; });
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", BASE + path);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.withCredentials = unresolved;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject({ code: data.detail || `http_${xhr.status}`, status: xhr.status, data });
      };
      xhr.onerror = () => reject({ code: "network" });
      xhr.send(formData);
    });
  },
};

export function fileUrl(fileId) {
  if (LOCAL_MODE) return localFileUrl(fileId);
  return `${BASE}/files/${fileId}/download`;
}
