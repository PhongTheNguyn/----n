let hasWarnedMissingTurnEnv = false;
const TURN_CACHE_TTL_MS = Number(process.env.TURN_CACHE_TTL_MS || 10 * 60 * 1000);
const TURN_FETCH_TIMEOUT_MS = Number(process.env.TURN_FETCH_TIMEOUT_MS || 3000);
let turnCache = {
  expiresAt: 0,
  data: null
};

function getCachedTurnPayload() {
  if (turnCache.data && Date.now() < turnCache.expiresAt) {
    return turnCache.data;
  }
  return null;
}

function setCachedTurnPayload(payload) {
  turnCache = {
    data: payload,
    expiresAt: Date.now() + TURN_CACHE_TTL_MS
  };
}

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

async function getTurnCredentials(req, res) {
    const fallbackIceServers = [{ urls: pickEnv('STUN_URL', 'STUN_SERVER_URL') || 'stun:stun.l.google.com:19302' }];
    try {
      const meteredTurnApp = pickEnv('METERED_TURN_APP', 'METERED_APP_NAME', 'METERED_APP', 'TURN_APP');
      const meteredApiKey = pickEnv('METERED_API_KEY', 'METERED_KEY', 'TURN_API_KEY');
      const meteredRegion = pickEnv('METERED_REGION', 'TURN_REGION');

      const staticTurnUrl = pickEnv('TURN_URL', 'TURN_SERVER_URL');
      const staticTurnUsername = pickEnv('TURN_USERNAME', 'TURN_USER');
      const staticTurnCredential = pickEnv('TURN_CREDENTIAL', 'TURN_PASSWORD');

      if (staticTurnUrl && staticTurnUsername && staticTurnCredential) {
        const payload = {
          iceServers: [
            ...fallbackIceServers,
            {
              urls: staticTurnUrl,
              username: staticTurnUsername,
              credential: staticTurnCredential
            }
          ]
        };
        setCachedTurnPayload(payload);
        return res.json(payload);
      }
  
      if (!meteredTurnApp || !meteredApiKey) {
        if (!hasWarnedMissingTurnEnv) {
          console.warn('TURN env not configured (checked Metered + static TURN keys), fallback to STUN');
          hasWarnedMissingTurnEnv = true;
        }
        return res.json({ iceServers: fallbackIceServers, fallback: true });
      }

      const cached = getCachedTurnPayload();
      if (cached) {
        return res.json(cached);
      }
  
      const url = new URL(`https://${meteredTurnApp}.metered.live/api/v1/turn/credentials`);
      url.searchParams.set('apiKey', meteredApiKey);
      if (meteredRegion) url.searchParams.set('region', meteredRegion);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(url.toString(), { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!response.ok) {
        const details = await response.text().catch(() => '');
        console.error('Metered TURN credentials error:', {
          status: response.status,
          details
        });
        return res.json({ iceServers: fallbackIceServers, fallback: true, meteredError: { status: response.status } });
      }
  
      const iceServers = await response.json(); // Metered thường trả về array
      if (!Array.isArray(iceServers)) {
        console.warn('Unexpected Metered response format, fallback to STUN');
        return res.json({ iceServers: fallbackIceServers, fallback: true });
      }

      const payload = { iceServers };
      setCachedTurnPayload(payload);
      return res.json(payload); // format bạn chọn (1)
    } catch (err) {
      console.error('getTurnCredentials error:', err);
      return res.json({ iceServers: fallbackIceServers, fallback: true });
    }
  }
  
  module.exports = { getTurnCredentials };