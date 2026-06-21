// Fetch wrappers. Every server route returns { ok, data } | { ok, error }.
// These helpers unwrap that envelope and throw on ok:false so views can
// try/catch cleanly.

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error('Network error — is the server running?');
  }
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`Bad response from ${url} (${res.status})`);
  }
  if (!payload.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload.data;
}

export const apiGet = (url) => request('GET', url);
export const apiPost = (url, body) => request('POST', url, body);
export const apiPut = (url, body) => request('PUT', url, body);
export const apiDelete = (url) => request('DELETE', url);
