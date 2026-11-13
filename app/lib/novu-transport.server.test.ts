import { describe, it, expect, vi } from "vitest";
import { novuTransport } from "./novu-transport.server";
import { TransportError, type OutboundNotification } from "./notifications.server";

const message: OutboundNotification = {
  idempotencyKey: "42",
  type: "refund_requested",
  subscriber: { id: "7", email: "ada@example.com", name: "Ada Lovelace" },
  payload: { courseTitle: "TypeScript", amountPaid: 4900 },
};

function stubFetch(response: Response | Error) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
}

function transportWith(fetchImpl: typeof fetch) {
  return novuTransport({ secretKey: "secret", fetch: fetchImpl });
}

describe("novuTransport", () => {
  it("triggers the US-region workflow with the outbox row id as Idempotency-Key", async () => {
    const fetchStub = stubFetch(new Response("{}", { status: 201 }));
    await transportWith(fetchStub).send(message);

    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe("https://api.novu.co/v1/events/trigger");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("42");
    expect(headers.Authorization).toBe("ApiKey secret");
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "refund-requested",
      to: {
        subscriberId: "7",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
      payload: { courseTitle: "TypeScript", amountPaid: 4900 },
    });
  });

  it("uses the awaiting-review workflow and omits lastName for a single-word name", async () => {
    const fetchStub = stubFetch(new Response("{}", { status: 201 }));
    await transportWith(fetchStub).send({
      ...message,
      type: "refund_awaiting_review",
      subscriber: { id: "1", email: "a@example.com", name: "Admin" },
    });
    const body = JSON.parse(fetchStub.mock.calls[0][1]?.body as string);
    expect(body.name).toBe("refund-awaiting-review");
    expect(body.to).toEqual({
      subscriberId: "1",
      email: "a@example.com",
      firstName: "Admin",
    });
  });

  it("sends the same Idempotency-Key on a retry of the same row", async () => {
    const fetchStub = stubFetch(new Response("{}", { status: 201 }));
    const transport = transportWith(fetchStub);
    await transport.send(message);
    await transport.send(message);
    const keys = fetchStub.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"]
    );
    expect(keys).toEqual(["42", "42"]);
  });

  it("sends a changed email on the next trigger so Novu updates the subscriber", async () => {
    const fetchStub = stubFetch(new Response("{}", { status: 201 }));
    const transport = transportWith(fetchStub);
    await transport.send(message);
    await transport.send({
      ...message,
      idempotencyKey: "43",
      subscriber: { ...message.subscriber, email: "ada@new.example.com" },
    });
    const emails = fetchStub.mock.calls.map(
      ([, init]) => JSON.parse(init?.body as string).to.email
    );
    expect(emails).toEqual(["ada@example.com", "ada@new.example.com"]);
  });

  it("throws a TransportError carrying the status for a 4xx", async () => {
    const transport = transportWith(stubFetch(new Response("bad", { status: 400 })));
    await expect(transport.send(message)).rejects.toMatchObject({ status: 400 });
  });

  it("throws a TransportError carrying the status for a 5xx", async () => {
    const transport = transportWith(stubFetch(new Response("", { status: 503 })));
    const error = await transport.send(message).catch((e) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error.status).toBe(503);
  });

  it("reads Retry-After seconds from a 429", async () => {
    const transport = transportWith(
      stubFetch(new Response("", { status: 429, headers: { "Retry-After": "90" } }))
    );
    const error = await transport.send(message).catch((e) => e);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(90);
  });

  it("ignores a Retry-After it cannot read as seconds", async () => {
    const transport = transportWith(
      stubFetch(new Response("", { status: 429, headers: { "Retry-After": "soon" } }))
    );
    const error = await transport.send(message).catch((e) => e);
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it("throws a status-less TransportError when the network fails (retryable)", async () => {
    const transport = transportWith(stubFetch(new Error("ECONNRESET")));
    const error = await transport.send(message).catch((e) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error.status).toBeUndefined();
    expect(error.message).toContain("ECONNRESET");
  });

  it("does not leak the response body into error messages", async () => {
    const transport = transportWith(
      stubFetch(new Response("ada@example.com secret", { status: 500 }))
    );
    const error = await transport.send(message).catch((e) => e);
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("ada@example.com");
  });
});
