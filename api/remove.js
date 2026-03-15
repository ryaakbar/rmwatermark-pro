// api/remove.js — Remove Watermark via ezremove.ai

import { IncomingForm } from 'formidable';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import path from 'path';

export const config = {
    api: { bodyParser: false }
};

async function ezremove(filePath) {
    const form = new FormData();
    form.append('image_file', fs.createReadStream(filePath), path.basename(filePath));

    const create = await axios.post(
        'https://api.ezremove.ai/api/ez-remove/watermark-remove/create-job',
        form,
        {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'origin': 'https://ezremove.ai',
                'referer': 'https://ezremove.ai/',
                'product-serial': 'sr-' + Date.now()
            },
            timeout: 30000,
        }
    ).then(v => v.data).catch(() => null);

    if (!create?.result?.job_id) return { status: 'error' };

    const job = create.result.job_id;

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const check = await axios.get(
            `https://api.ezremove.ai/api/ez-remove/watermark-remove/get-job/${job}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'origin': 'https://ezremove.ai',
                    'referer': 'https://ezremove.ai/',
                    'product-serial': 'sr-' + Date.now()
                },
                timeout: 10000,
            }
        ).then(v => v.data).catch(() => null);

        if (check?.code === 100000 && check?.result?.output) {
            return { job, result: check.result.output[0] };
        }

        if (!check || (check.code !== 300001 && check.code !== 100000)) break;
    }

    return { status: 'processing', job };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const form = new IncomingForm({
            maxFileSize: 10 * 1024 * 1024,
            keepExtensions: true,
        });

        const [, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve([fields, files]);
            });
        });

        const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
        if (!imageFile) return res.status(400).json({ error: 'No image file provided' });

        const result = await ezremove(imageFile.filepath);

        try { fs.unlinkSync(imageFile.filepath); } catch {}

        if (result.status === 'error') {
            return res.status(500).json({ success: false, error: 'Gagal memproses gambar. Coba lagi.' });
        }
        if (result.status === 'processing') {
            return res.status(202).json({ success: false, error: 'Timeout processing. Coba lagi.', jobId: result.job });
        }
        if (result.result) {
            return res.status(200).json({ success: true, jobId: result.job, resultUrl: result.result });
        }

        return res.status(500).json({ success: false, error: 'Tidak ada hasil dari API.' });

    } catch (error) {
        console.error('[remove] Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
}
