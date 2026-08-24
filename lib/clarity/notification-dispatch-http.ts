import { isDispatchAuthorizationValid } from "./notification-dispatch-domain.ts";
import type { NotificationDispatchSummary } from "./notification-dispatch-core.ts";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export async function handleNotificationDispatchRequest(
  request: Request,
  options: {
    secret: string | undefined;
    dispatch: () => Promise<NotificationDispatchSummary>;
    onError?: (error: unknown) => void;
  },
) {
  const secret = options.secret?.trim();
  if (!secret) {
    return Response.json(
      { error: "Notification dispatcher is not configured." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (!isDispatchAuthorizationValid(request.headers.get("authorization"), secret)) {
    return Response.json(
      { error: "Unauthorized." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    return Response.json(await options.dispatch(), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    options.onError?.(error);
    return Response.json(
      { error: "Notification dispatch failed." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
