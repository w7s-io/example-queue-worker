type Env = {
  STATE: KVNamespace;
  W7S_QUEUE: Fetcher;
  W7S_QUEUE_TOKEN: string;
  W7S_REPOSITORY: string;
  W7S_ENVIRONMENT: string;
};

type QueueBatch = {
  queue?: string;
  queueName?: string;
  messages?: Array<{
    id?: string;
    attempts?: number;
    timestamp?: string;
    enqueuedAt?: string | null;
    caller?: unknown;
    body?: unknown;
  }>;
};

const QUEUE_URL = "https://w7s.internal/api/v1/queues/w7s-io/example-queue-worker/jobs";

const json = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
};

const readJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const lastMessage = async (env: Env) => {
  const raw = await env.STATE.get("last-message");
  return raw ? JSON.parse(raw) : null;
};

const enqueue = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const id = crypto.randomUUID();
  const payload = {
    id,
    text: url.searchParams.get("text") || "hello from W7S Queue",
    createdAt: new Date().toISOString(),
    source: env.W7S_REPOSITORY,
    environment: env.W7S_ENVIRONMENT
  };

  const response = await env.W7S_QUEUE.fetch(QUEUE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.W7S_QUEUE_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return json(
    {
      service: "example-queue-worker",
      status: response.ok ? "queued" : "error",
      id,
      queue: "jobs",
      target: "w7s-io/example-queue-worker",
      queueStatus: response.status,
      queueResponse: await readJson(response)
    },
    { status: response.ok ? 202 : 502 }
  );
};

const consumeJobs = async (request: Request, env: Env) => {
  const batch = await request.json<QueueBatch>();
  const messages = Array.isArray(batch.messages) ? batch.messages : [];
  const record = {
    service: "example-queue-worker",
    status: "processed",
    processedAt: new Date().toISOString(),
    queue: batch.queue ?? "jobs",
    queueName: batch.queueName ?? null,
    count: messages.length,
    lastMessage: messages.at(-1) ?? null,
    messages
  };

  await env.STATE.put("last-message", JSON.stringify(record));
  return json({
    status: "ok",
    processed: messages.length
  });
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        status: "ok",
        service: "example-queue-worker",
        repository: env.W7S_REPOSITORY,
        environment: env.W7S_ENVIRONMENT
      });
    }

    if (url.pathname === "/last") {
      return json({
        service: "example-queue-worker",
        status: "ok",
        last: await lastMessage(env)
      });
    }

    if (url.pathname === "/enqueue" && (request.method === "GET" || request.method === "POST")) {
      return enqueue(request, env);
    }

    if (url.pathname === "/_w7s/queues/jobs" && request.method === "POST") {
      return consumeJobs(request, env);
    }

    if (url.pathname === "/") {
      return json({
        service: "example-queue-worker",
        status: "ok",
        queue: "jobs",
        endpoints: {
          enqueue: "/enqueue",
          last: "/last",
          health: "/health"
        }
      });
    }

    return json(
      {
        status: "error",
        error: "Not found"
      },
      { status: 404 }
    );
  }
};
