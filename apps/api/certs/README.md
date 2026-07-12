# Netskope root CA

`netskope-root-ca.pem` is the root CA certificate used by this network's Netskope TLS
inspection proxy. It is a **public root certificate, not a secret** - safe to commit.

## Why this is here

On networks that run Netskope (or similar TLS-inspecting proxies), all outbound HTTPS traffic
is intercepted and re-signed with a Netskope-issued certificate. Node.js does **not** read the
OS certificate store, so it doesn't trust this proxy certificate by default and every outbound
`fetch()`/HTTPS request from the API (e.g. the smart-crawler's source probe) fails with:

```
self-signed certificate in certificate chain
```

Setting the `NODE_EXTRA_CA_CERTS` environment variable to point at this file adds it to Node's
trusted CA bundle, which fixes the issue.

## Why it's baked into `npm run start` / `npm run dev`

`NODE_EXTRA_CA_CERTS` is only read by Node **once, at process startup** - setting it
programmatically after the process has already booted does not work. So it has to be set
before `node`/`tsx` launches, which is why `apps/api/package.json`'s `start` and `dev` scripts
use `cross-env NODE_EXTRA_CA_CERTS=./certs/netskope-root-ca.pem` to set it as part of the launch
command itself, rather than inside `main.ts`.

On machines that aren't behind Netskope, this is a harmless no-op - it just adds one extra
trusted root CA that will simply never be used.
