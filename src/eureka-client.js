// Eureka protocol client for the browser (github.com/python1/eureka_protocol): this tab is a Eureka node that
// handshakes with an external agent's daemon and asks it for room turns. Encoding and signatures match the
// Python implementation byte for byte; test/fixtures/eureka/signatures-v1.json is the shared contract.

const PROTOCOL = 'eureka/1.0';

/** The signing domains this client uses. The identity key signs nothing else (see createIdentity). */
export const DOMAINS = Object.freeze({
  handshake_offer: 'eureka/handshake/offer/v1',
  handshake: 'eureka/handshake/v1',
  handshake_confirm: 'eureka/handshake/confirm/v1',
  read_query: 'eureka/read/query/v1',
  assign_query: 'eureka/assign/query/v1',
  assign_result: 'eureka/assign/result/v1'
});
const SIGNABLE = new Set(['handshake_offer', 'handshake_confirm', 'read_query', 'assign_query']);

export const ROOM_TURN = 'room-turn';

const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g) || [], b => parseInt(b, 16));
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const KEY = /^[0-9a-f]{64}$/;

// Python's json.dumps(sort_keys=True, separators=(',', ':')) with its default ensure_ascii=True: everything outside
// printable ASCII (DEL included) becomes \uXXXX per UTF-16 unit, and keys sort by code point.
const ESCAPES = {'"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f'};
const quote = s => '"' + s.replace(/["\\]|[^ -~]/g, c => ESCAPES[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"';
const byCodePoint = (a, b) => {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; }
  return x.length - y.length;
};

/** Canonical JSON, as the Python daemon signs it. Floats are refused: they are not part of the shared contract. */
export function canonical(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) throw new Error('only safe integers can be signed'); return String(value); }
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.keys(value).sort(byCodePoint).map(k => quote(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error(`cannot sign a ${typeof value}`);
}

/** Domain tag, NUL, canonical payload: the exact bytes that are signed. */
export function signedBytes(domain, payload) {
  const tag = enc.encode(DOMAINS[domain] ?? (() => { throw new Error(`unknown signing domain ${domain}`); })());
  const body = enc.encode(canonical(payload)), out = new Uint8Array(tag.length + 1 + body.length);
  out.set(tag); out.set(body, tag.length + 1);
  return out;
}

export async function nodeIdOf(publicKey) { return 'node_' + hex(await crypto.subtle.digest('SHA-256', unhex(publicKey))).slice(0, 8); }

export const validKey = key => typeof key === 'string' && KEY.test(key);

export async function verify(publicKey, signature, domain, payload) {
  if (!validKey(publicKey) || typeof signature !== 'string') return false;
  try {
    const key = await crypto.subtle.importKey('raw', unhex(publicKey), {name: 'Ed25519'}, false, ['verify']);
    return await crypto.subtle.verify({name: 'Ed25519'}, key, unb64(signature), signedBytes(domain, payload));
  } catch { return false; }
}

/**
 * This browser's Eureka identity: an Ed25519 key pair whose private half is non-extractable, kept in IndexedDB as a
 * CryptoKey. It signs only the four Eureka request domains, always behind their tag, so it can never produce an
 * SSH signature (Verified Memory packs) or anything else. `store` is {get, put}; tests pass an in-memory one.
 */
export async function createIdentity(store = indexedDbStore()) {
  let pair = await store.get();
  if (!pair) {
    pair = await crypto.subtle.generateKey({name: 'Ed25519'}, false, ['sign', 'verify']);
    await store.put(pair);
  }
  const publicKey = hex(await crypto.subtle.exportKey('raw', pair.publicKey));
  return Object.freeze({
    publicKey,
    nodeId: await nodeIdOf(publicKey),
    extractable: pair.privateKey.extractable,
    async sign(domain, payload) {
      if (!SIGNABLE.has(domain)) throw new Error(`this key does not sign ${domain}`);
      return b64(await crypto.subtle.sign({name: 'Ed25519'}, pair.privateKey, signedBytes(domain, payload)));
    }
  });
}

export function indexedDbStore(name = 'knights-circle-eureka') {
  const run = (mode, op) => new Promise((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = op(open.result.transaction('keys', mode).objectStore('keys'));
      request.onsuccess = () => { resolve(request.result); open.result.close(); };
      request.onerror = () => { reject(request.error); open.result.close(); };
    };
  });
  return {get: () => run('readonly', s => s.get('identity')), put: pair => run('readwrite', s => s.put(pair, 'identity'))};
}

/** A refusal or failure with a reason the room can explain. `kind` is 'network', 'refused' or 'invalid'. */
export class EurekaError extends Error {
  constructor(kind, reason, message) { super(message); this.name = 'EurekaError'; this.kind = kind; this.reason = reason; }
}

const nonce = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const now = () => new Date().toISOString();
const same = (a, b) => canonical(a) === canonical(b);

/**
 * One external agent, pinned by its public key. handshake() runs the three-message exchange; turn() sends one signed
 * room-turn and returns the agent's reply only if the result is signed by the pinned key and bound to this request.
 */
export class EurekaPeer {
  constructor({url, publicKey, identity, fetcher = (...a) => fetch(...a)}) {
    if (!validKey(publicKey)) throw new Error('agent public key must be 64 hex characters');
    this.url = url.replace(/\/+$/, ''); this.publicKey = publicKey; this.identity = identity; this.fetcher = fetcher;
    this.peerId = null; this.shaken = false;
  }

  async post(path, body, signal) {
    let response;
    try {
      response = await this.fetcher(this.url + path, body === undefined ? {signal} : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal});
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') throw e;
      throw new EurekaError('network', 'unreachable', e.message);
    }
    try { return await response.json(); } catch { throw new EurekaError('invalid', 'not_json', `The agent answered with something other than JSON (HTTP ${response.status}).`); }
  }

  async handshake(signal) {
    this.shaken = false;
    const me = this.identity, manifest = await this.post('/v1/manifest', undefined, signal);
    const expected = await nodeIdOf(this.publicKey);
    if (manifest?.node_id !== expected) throw new EurekaError('refused', 'wrong_node', `The agent at ${this.url} is ${manifest?.node_id || 'unknown'}, not the pinned key’s ${expected}.`);
    const challenge = {protocol: PROTOCOL, event: 'handshake_challenge', initiator_id: me.nodeId, peer_id: expected, nonce: nonce(), timestamp: now()};
    const two = await this.post('/v1/handshake/offer', {event: 'handshake_offer', initiator_id: me.nodeId, challenge, public_key: me.publicKey, signature: await me.sign('handshake_offer', challenge)}, signal);
    if (two?.authenticated === false) throw new EurekaError('refused', two.reason, refusal(two.reason));
    const ok = two?.public_key === this.publicKey && two.responder_id === expected && two.challenge && same(two.challenge, challenge)
      && await verify(this.publicKey, two.signature, 'handshake', two.challenge);
    if (!ok) throw new EurekaError('refused', 'bad_signature', 'The agent’s reply was not signed by its pinned key.');
    const counter = two.counter_challenge;
    if (!counter || typeof counter !== 'object') throw new EurekaError('invalid', 'malformed', 'The agent sent no counter-challenge.');
    const three = await this.post('/v1/handshake/confirm', {event: 'handshake_confirm', initiator_id: me.nodeId, challenge: counter, public_key: me.publicKey, signature: await me.sign('handshake_confirm', counter)}, signal);
    if (three?.authenticated !== true) throw new EurekaError('refused', three?.reason || 'malformed', refusal(three?.reason));
    this.peerId = expected; this.shaken = true;
    return {peerId: expected};
  }

  /** One room turn. Handshakes first if needed, and once more if the daemon has forgotten this browser (a restart). */
  async turn(payload, signal) {
    if (!this.shaken) await this.handshake(signal);
    let answer = await this.assign(payload, signal);
    if (answer.reason === 'not_authenticated') { await this.handshake(signal); answer = await this.assign(payload, signal); }
    return answer.reply ?? (() => { throw new EurekaError('refused', answer.reason, refusal(answer.reason)); })();
  }

  async assign(payload, signal) {
    const me = this.identity;
    const query = {protocol: PROTOCOL, event: 'assign_query', requester_id: me.nodeId, timestamp: now(), nonce: nonce(), capability: ROOM_TURN, task_name: 'knights-circle-turn', payload};
    const answer = await this.post('/v1/assign', {event: 'assign_query', requester_id: me.nodeId, public_key: me.publicKey, query, signature: await me.sign('assign_query', query)}, signal);
    if (answer?.event !== 'assign_answer') return {reason: answer?.reason || 'malformed'};
    const result = answer.result;
    const bound = result && result.nonce === query.nonce && result.requester_id === me.nodeId && result.responder_id === this.peerId && result.capability === ROOM_TURN
      && answer.responder_id === this.peerId && await verify(this.publicKey, answer.result_signature, 'assign_result', result);
    if (!bound) throw new EurekaError('refused', 'bad_result', 'The agent’s reply was not signed by its pinned key for this request, so it was discarded.');
    if (result.status !== 'completed' || typeof result.output?.text !== 'string') throw new EurekaError('refused', result.reason, `The agent couldn’t take its turn (${result.reason || 'failed'}).`);
    return {reply: {text: result.output.text, model: result.output.model, truncated: !!result.output.truncated, taskId: result.task_id, nonce: query.nonce, signature: answer.result_signature, peerId: this.peerId}};
  }
}

const REFUSALS = {
  untrusted_key: 'The agent doesn’t trust this browser’s room key. On the agent’s computer, run eureka-daemon stop, then eureka-daemon setup again, and paste this browser’s room key from Connections → Advanced: bring your own bot. Then run eureka-daemon start. Advanced users can run eureka-daemon trust add with the room-turn grant instead, then restart the daemon.',
  revoked_key: 'The agent has revoked this browser’s room key.',
  capability_not_granted: 'The agent trusts this room but hasn’t granted it room-turn (or doesn’t offer it: start the daemon with EUREKA_ROOM_TURN=1).',
  stale_timestamp: 'The agent refused the request as stale. Check that this computer’s clock is correct.',
  replayed_nonce: 'The agent refused a repeated request.',
  room_turn_too_long: 'The turn was too long for the agent (48,000 characters). Send fewer messages.'
};
export const refusal = reason => REFUSALS[reason] || `The agent refused the request (${reason || 'no reason given'}).`;
