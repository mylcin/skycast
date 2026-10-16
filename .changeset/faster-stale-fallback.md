---
'skycast': patch
---

Offline answers from the cache arrive in about 6 s instead of 25 s on a network that drops packets: when a usable stale entry exists, each attempt times out after 3 s and is retried once.
