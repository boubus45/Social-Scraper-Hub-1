// OAuth token store and exchange logic per platform

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // ms since epoch
  tokenType: string;
  scope?: string;
}

// In-memory store: userId -> platform -> token
const tokenStore = new Map<string, Map<string, StoredToken>>();

export function getToken(userId: string, platform: string): StoredToken | undefined {
  return tokenStore.get(userId)?.get(platform);
}

export function setToken(userId: string, platform: string, token: StoredToken): void {
  if (!tokenStore.has(userId)) tokenStore.set(userId, new Map());
  tokenStore.get(userId)!.set(platform, token);
}

export function clearToken(userId: string, platform: string): void {
  tokenStore.get(userId)?.delete(platform);
}

export function isConnected(userId: string, platform: string): boolean {
  const token = getToken(userId, platform);
  return !!token && token.expiresAt > Date.now();
}

// ─── Platform-specific OAuth exchange logic ───────────────────────────────

interface OAuthConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

function getOAuthConfig(platform: string): OAuthConfig | null {
  switch (platform) {
    case 'reddit':
      return {
        tokenUrl: 'https://www.reddit.com/api/v1/access_token',
        clientId: process.env.REDDIT_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.REDDIT_OAUTH_CLIENT_SECRET,
        redirectUri: process.env.REDDIT_OAUTH_REDIRECT_URI ?? 'socialscraper://oauth/reddit',
      };
    case 'x':
      return {
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        clientId: process.env.X_OAUTH_CLIENT_ID ?? '',
        redirectUri: process.env.X_OAUTH_REDIRECT_URI ?? 'socialscraper://oauth/x',
      };
    case 'linkedin':
      return {
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        clientId: process.env.LINKEDIN_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.LINKEDIN_OAUTH_CLIENT_SECRET,
        redirectUri: process.env.LINKEDIN_OAUTH_REDIRECT_URI ?? 'socialscraper://oauth/linkedin',
      };
    case 'facebook':
      return {
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        clientId: process.env.FACEBOOK_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.FACEBOOK_OAUTH_CLIENT_SECRET,
        redirectUri: process.env.FACEBOOK_OAUTH_REDIRECT_URI ?? 'socialscraper://oauth/facebook',
      };
    case 'instagram':
      return {
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        clientId: process.env.INSTAGRAM_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.INSTAGRAM_OAUTH_CLIENT_SECRET,
        redirectUri: process.env.INSTAGRAM_OAUTH_REDIRECT_URI ?? 'socialscraper://oauth/instagram',
      };
    default:
      return null;
  }
}

export interface ExchangeResult {
  ok: boolean;
  token?: StoredToken;
  error?: string;
}

export async function exchangeCodeForToken(
  platform: string,
  code: string,
  userId: string,
  codeVerifier?: string,
): Promise<ExchangeResult> {
  const config = getOAuthConfig(platform);
  if (!config || !config.clientId) {
    return { ok: false, error: `OAuth not configured for ${platform}. Set the OAuth env vars on the backend.` };
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
    });

    if (config.clientSecret) {
      body.append('client_secret', config.clientSecret);
    }

    // Twitter/PKCE: include code_verifier
    if (codeVerifier) {
      body.append('code_verifier', codeVerifier);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Reddit uses Basic auth for token endpoint
    if (platform === 'reddit') {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret ?? ''}`).toString('base64')}`;
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Token exchange failed (${response.status}): ${text}` };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) {
      return { ok: false, error: 'No access token in response.' };
    }

    const expiresIn = (data.expires_in as number) ?? 3600;
    const token: StoredToken = {
      accessToken,
      refreshToken: data.refresh_token as string | undefined,
      expiresAt: Date.now() + expiresIn * 1000,
      tokenType: (data.token_type as string) ?? 'bearer',
      scope: data.scope as string | undefined,
    };

    setToken(userId, platform, token);
    return { ok: true, token };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function refreshTokenIfNeeded(
  platform: string,
  userId: string,
): Promise<StoredToken | null> {
  const token = getToken(userId, platform);
  if (!token) return null;

  // Refresh if expires in < 5 minutes
  if (token.expiresAt > Date.now() + 5 * 60 * 1000) {
    return token;
  }

  if (!token.refreshToken) return token; // can't refresh

  const config = getOAuthConfig(platform);
  if (!config) return token;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: config.clientId,
    });
    if (config.clientSecret) body.append('client_secret', config.clientSecret);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) return token;

    const data = (await response.json()) as Record<string, unknown>;
    const newToken: StoredToken = {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? token.refreshToken,
      expiresAt: Date.now() + ((data.expires_in as number) ?? 3600) * 1000,
      tokenType: (data.token_type as string) ?? 'bearer',
      scope: (data.scope as string) ?? token.scope,
    };
    setToken(userId, platform, newToken);
    return newToken;
  } catch {
    return token;
  }
}
