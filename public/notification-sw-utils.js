(function attachClarityNotificationUtils(scope) {
  const NAVIGATION_MESSAGE_TYPE = "clarity:notification-navigation";
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function normalizeTargetUrl(value) {
    if (typeof value !== "string") return null;
    let target;
    try {
      target = new URL(value, scope.location.origin);
    } catch {
      return null;
    }
    if (target.origin !== scope.location.origin || target.pathname !== "/calendar") {
      return null;
    }
    const date = target.searchParams.get("date");
    const commitment = target.searchParams.get("commitment");
    if (!date || !DATE_PATTERN.test(date) || !commitment || !UUID_PATTERN.test(commitment)) {
      return null;
    }
    return `${target.pathname}?date=${encodeURIComponent(date)}&commitment=${encodeURIComponent(commitment)}`;
  }

  function parsePushPayload(value) {
    if (!value || typeof value !== "object") return null;
    const title = typeof value.title === "string" ? value.title.trim() : "";
    const body = typeof value.body === "string" ? value.body.trim() : "";
    const tag = typeof value.tag === "string" ? value.tag.trim() : "";
    const targetUrl = normalizeTargetUrl(value.targetUrl);
    if (
      !title ||
      title.length > 200 ||
      body.length > 500 ||
      !tag ||
      tag.length > 200 ||
      !targetUrl
    ) {
      return null;
    }
    return { title, body, tag, targetUrl };
  }

  async function focusAndNavigateClient(client, absoluteTargetUrl) {
    let focusedClient = client;
    try {
      focusedClient = (await client.focus()) || client;
    } catch {
      // Navigation or the page-side fallback may still be available.
    }

    if (typeof focusedClient.navigate === "function") {
      try {
        const navigatedClient = await focusedClient.navigate(absoluteTargetUrl);
        if (navigatedClient) {
          try {
            await navigatedClient.focus();
          } catch {
            // The target navigation already succeeded.
          }
          return navigatedClient;
        }
      } catch {
        // WebKit can reject WindowClient.navigate() for a foregrounded PWA.
      }
    }

    if (typeof focusedClient.postMessage === "function") {
      focusedClient.postMessage({
        type: NAVIGATION_MESSAGE_TYPE,
        targetUrl: absoluteTargetUrl,
      });
      return focusedClient;
    }

    return null;
  }

  async function openNotificationTarget(clientsApi, value) {
    const targetUrl = normalizeTargetUrl(value);
    if (!targetUrl) return null;

    const absoluteTargetUrl = new URL(targetUrl, scope.location.origin).href;
    const windowClients = await clientsApi.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const existingClient = windowClients.find((client) => {
      try {
        return new URL(client.url).origin === scope.location.origin;
      } catch {
        return false;
      }
    });

    if (existingClient) {
      const navigatedClient = await focusAndNavigateClient(
        existingClient,
        absoluteTargetUrl,
      );
      if (navigatedClient) return navigatedClient;
    }

    const openedClient = await clientsApi.openWindow(absoluteTargetUrl);
    if (!openedClient) return null;
    try {
      if (new URL(openedClient.url).href === absoluteTargetUrl) {
        return openedClient;
      }
    } catch {
      // Treat an unreadable launch URL as requiring explicit navigation.
    }
    return (
      (await focusAndNavigateClient(openedClient, absoluteTargetUrl)) ||
      openedClient
    );
  }

  scope.ClarityNotificationUtils = {
    NAVIGATION_MESSAGE_TYPE,
    normalizeTargetUrl,
    openNotificationTarget,
    parsePushPayload,
  };
})(self);
