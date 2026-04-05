export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** @deprecated use aiPlatformUrl + aiPlatformToken instead */
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  /** @deprecated use aiPlatformUrl + aiPlatformToken instead */
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** P12: Shared secret for inter-service authentication (transport <-> logistics) */
  interServiceSecret: process.env.INTER_SERVICE_SECRET ?? "",
  /** P12: Base URL of the webwaka-transport service */
  transportBaseUrl: process.env.TRANSPORT_BASE_URL ?? "",
  /** L-06: Termii API key for OTP SMS delivery via @webwaka/core Termii provider */
  termiiApiKey: process.env.TERMII_API_KEY ?? "",
  /** AI Platform gateway — all LLM calls route through webwaka-ai-platform */
  aiPlatformUrl: process.env.AI_PLATFORM_URL ?? "",
  aiPlatformToken: process.env.AI_PLATFORM_TOKEN ?? "",
};

