// Appels au serveur. Il exige un Content-Type précis par route (protection CSRF).
export async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof Blob) {
    opts.headers['Content-Type'] = 'application/octet-stream';
    opts.body = body;
  } else if (typeof body === 'string') {
    opts.headers['Content-Type'] = 'text/markdown';
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}
