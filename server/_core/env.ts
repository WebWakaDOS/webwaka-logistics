export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** P12: Shared secret for inter-service authentication (transport ↔ logistics) */
  interServiceSecret: process.env.INTER_SERVICE_SECRET ?? "",
  /** P12: Base URL of the webwaka-transport service */
  transportBaseUrl: process.env.TRANSPORT_BASE_URL ?? "",
};
