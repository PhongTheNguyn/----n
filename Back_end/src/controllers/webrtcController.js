async function getTurnCredentials(req, res) {
    try {
      const { METERED_TURN_APP, METERED_API_KEY, METERED_REGION } = process.env;
  
      if (!METERED_TURN_APP || !METERED_API_KEY) {
        return res.status(500).json({ error: 'Metered TURN env not configured' });
      }
  
      const url = new URL(`https://${METERED_TURN_APP}.metered.live/api/v1/turn/credentials`);
      url.searchParams.set('apiKey', METERED_API_KEY);
      if (METERED_REGION) url.searchParams.set('region', METERED_REGION);
  
      const response = await fetch(url.toString());
      if (!response.ok) {
        const details = await response.text().catch(() => '');
        return res.status(response.status).json({ error: 'Metered error', details });
      }
  
      const iceServers = await response.json(); // Metered thường trả về array
      if (!Array.isArray(iceServers)) {
        return res.status(500).json({ error: 'Unexpected Metered response format' });
      }
  
      return res.json({ iceServers }); // format bạn chọn (1)
    } catch (err) {
      console.error('getTurnCredentials error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
  
  module.exports = { getTurnCredentials };