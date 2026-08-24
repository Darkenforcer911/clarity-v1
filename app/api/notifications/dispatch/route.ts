import { handleNotificationDispatchRequest } from "@/lib/clarity/notification-dispatch-http";
import { dispatchDueNotifications } from "@/lib/clarity/notification-dispatcher";

// Route Handlers use the Node.js runtime by default. This project enables
// cacheComponents, which intentionally disallows route-level runtime config.

export async function POST(request: Request) {
  return handleNotificationDispatchRequest(request, {
    secret: process.env.CRON_SECRET,
    dispatch: dispatchDueNotifications,
    onError(error) {
      console.error("Notification dispatch failed", safeServerError(error));
    },
  });
}

function safeServerError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown dispatcher error";
}
