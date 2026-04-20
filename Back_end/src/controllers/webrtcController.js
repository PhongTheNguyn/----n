let hasWarnedMissingTurnEnv = false;

async function getTurnCredentials(req, res) {
    const fallbackIceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const { METERED_TURN_APP, METERED_API_KEY, METERED_REGION } = process.env;
  
      if (!METERED_TURN_APP || !METERED_API_KEY) {
        if (!hasWarnedMissingTurnEnv) {
          console.warn('Metered TURN env not configured, fallback to STUN');
          hasWarnedMissingTurnEnv = true;
        }
        return res.json({ iceServers: fallbackIceServers, fallback: true });
      }
  
      const url = new URL(`https://${METERED_TURN_APP}.metered.live/api/v1/turn/credentials`);
      url.searchParams.set('apiKey', METERED_API_KEY);
      if (METERED_REGION) url.searchParams.set('region', METERED_REGION);
  
      const response = await fetch(url.toString());
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
  
      return res.json({ iceServers }); // format bạn chọn (1)
    } catch (err) {
      console.error('getTurnCredentials error:', err);
      return res.json({ iceServers: fallbackIceServers, fallback: true });
    }
  }
  
  module.exports = { getTurnCredentials };