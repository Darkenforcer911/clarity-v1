/**
 * Keeps the Supabase client's public identity (cookie namespace and signed
 * Storage URLs) while allowing server-originated requests to use a private
 * network route. The override is optional and has no production effect when
 * SUPABASE_SERVER_URL is unset.
 */
export function createSupabaseServerFetch(
  publicUrl: string,
  serverUrlInput: string | undefined,
  fetchImplementation: typeof fetch = fetch,
) {
  const serverUrl = serverUrlInput?.trim();
  if (!serverUrl) return undefined;

  const publicOrigin = new URL(publicUrl).origin;
  const serverOrigin = new URL(serverUrl).origin;
  if (publicOrigin === serverOrigin) return undefined;

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const sourceUrl = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (sourceUrl.origin !== publicOrigin) {
      return fetchImplementation(input, init);
    }

    const targetUrl = new URL(
      `${sourceUrl.pathname}${sourceUrl.search}`,
      serverOrigin,
    );
    if (input instanceof Request) {
      return fetchImplementation(new Request(targetUrl, input), init);
    }
    return fetchImplementation(targetUrl, init);
  };
}
