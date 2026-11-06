/**
 * Fixed, fake configuration for the browser-test servers. None of these values
 * exist outside the tests: the app bundle is built with them in `.next-e2e`, and
 * the realtime server only accepts tickets signed with E2E_MULTIPLAYER_SECRET.
 */
export const APP_PORT = 3100;
export const REALTIME_PORT = 3101;
/** The Discord SDK only accepts RPC messages from its allowlisted origins; this is one of them. */
export const DISCORD_HOST_ORIGIN = "http://localhost:3333";

export const E2E_DISCORD_CLIENT_ID = "100000000000000001";
export const E2E_MULTIPLAYER_SECRET = "neon-fuse-e2e-only-secret-not-used-anywhere-else";
export const E2E_MULTIPLAYER_URL = `ws://127.0.0.1:${REALTIME_PORT}/multiplayer`;
