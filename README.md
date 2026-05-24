# example-queue-worker

Small W7S backend that declares a queue, enqueues work through `env.W7S_QUEUE`, and consumes queue batches in the same backend.

## Public endpoints

```text
GET  https://w7s-io.w7s.cloud/example-queue-worker/
POST https://w7s-io.w7s.cloud/example-queue-worker/enqueue
GET  https://w7s-io.w7s.cloud/example-queue-worker/last
GET  https://w7s-io.w7s.cloud/example-queue-worker/health
```

`/enqueue` sends a JSON message through:

```text
env.W7S_QUEUE.fetch("https://w7s.internal/api/v1/queues/w7s-io/example-queue-worker/jobs")
```

W7S delivers the batch back to this backend at:

```text
/_w7s/queues/jobs
```

The consumer stores the latest processed message in the per-app `STATE` KV binding, so `/last` can verify delivery.

## Manifest

```json
{
  "bindings": {
    "kv": ["STATE"]
  },
  "queues": ["jobs"]
}
```

## Deploy

This repo deploys on every push with:

```yaml
- uses: w7s-io/w7s-cloud@v1
  with:
    token: ${{ github.token }}
```

The workflow smoke test enqueues a message and polls `/last` until the queue consumer has processed it.
