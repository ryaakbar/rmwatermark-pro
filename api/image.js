// api/image.js — Proxy gambar hasil dari URL eksternal
// Ini buat bypass CORS waktu nampilin gambar di browser

const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        const decoded = decodeURIComponent(url);
        const response = await axios.get(decoded, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://ezremove.ai/',
            },
            timeout: 15000,
        });

        const ct = response.headers['content-type'] || 'image/png';
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        return res.status(200).send(Buffer.from(response.data));

    } catch (error) {
        return res.status(500).json({ error: 'Proxy failed: ' + error.message });
    }
};
