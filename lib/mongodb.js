import { MongoClient } from 'mongodb';

/**
 * The one MongoDB client for the server.
 *
 * The connection is made LAZILY, on the first call to getMongoClient(), and only
 * a connection that actually succeeded is remembered. Two failure modes this
 * fixes, both seen in development against Atlas:
 *
 *   1. A failed connect() used to be cached — in `global`, so it survived hot
 *      reloads too — which meant one network blip broke the process until it was
 *      restarted, long after Mongo was reachable again.
 *   2. That promise was created at module scope with no handler attached, so a
 *      rejection arrived as an `unhandledRejection` and killed `next dev`.
 *
 * Callers just `await getMongoClient()` and own their own error handling; every
 * store in lib/ already has a fallback for a read it cannot do.
 */

const uri = process.env.MONGODB_URI;

const options = {
  // The driver defaults are 30s. Ten is plenty for a healthy cluster and means
  // a stalled one fails while a page render or API route is still worth
  // answering; scripts/*.mjs use the same figure.
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  // The driver opens 100 connections per client by default. Serverless
  // instances are numerous and short-lived, and Atlas M0 caps the whole cluster
  // at 500, so a small pool per instance is the safer ceiling.
  maxPoolSize: 10,
};

// On globalThis so a dev-mode hot reload reuses one pool instead of leaking a
// client (and its monitoring loop) on every edit.
const cache = (globalThis.__jambitoMongo ??= { promise: null });

if (!uri) {
  throw new Error('Please add your Mongo URI to .env.local');
}

function connect() {
  const client = new MongoClient(uri, options);
  const promise = client.connect();

  // Someone may not be awaiting yet when this rejects — that is exactly the
  // case that killed `next dev`. Marking it handled here is what keeps the
  // process alive; the error is still delivered to every real caller.
  promise.catch(() => {});

  // Only a successful connection stays cached, so the next caller retries
  // instead of being handed a dead promise forever.
  promise.catch(() => {
    if (cache.promise === promise) cache.promise = null;
  });

  return promise;
}

/**
 * A connected client, connecting on first use.
 *
 * Resolves to the same client while the connection is healthy; after a failure
 * the next call opens a fresh one.
 */
export function getMongoClient() {
  if (!cache.promise) cache.promise = connect();
  return cache.promise;
}