import { createV1HostEventHook } from "../../src/adapters/v1/capabilities/host-event-delivery.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOpaqueEventDelivery(): Promise<void> {
  const nativeEvent = {
    id: "evt-1",
    type: "session.updated",
    properties: { sessionID: "session-1" },
  };
  let received: unknown;
  const event = createV1HostEventHook((input) => {
    received = input;
  });

  await event({ event: nativeEvent });

  assert(
    received === nativeEvent,
    "v1 event mapping must deliver the original host event without reinterpretation",
  );
}

async function assertDeliveryFailureRemainsObservable(): Promise<void> {
  const failure = new Error("delivery failed");
  const event = createV1HostEventHook(() => {
    throw failure;
  });

  let caught: unknown;
  try {
    await event({ event: { type: "message.updated" } });
  } catch (error) {
    caught = error;
  }

  assert(
    caught === failure,
    "v1 event mapping must not swallow consumer delivery failures",
  );
}

void (async () => {
  await assertOpaqueEventDelivery();
  await assertDeliveryFailureRemainsObservable();
})();
