export function authenticatedHeaders(
  authToken: string | undefined,
  initialHeaders?: HeadersInit
) {
  const headers = new Headers(initialHeaders);

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  return headers;
}
