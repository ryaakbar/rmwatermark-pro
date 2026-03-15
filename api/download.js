// api/download.js — Proxy download hasil remove watermark
const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
        });

        const filename = `removed-watermark-${Date.now()}.png`;
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', response.data.length);
        return res.status(200).send(Buffer.from(response.data));

    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to download' });
    }
};
