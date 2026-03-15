// api/remove.js — Remove Watermark via ezremove.ai
// CommonJS format — lebih compatible di Vercel dengan bodyParser: false

const { IncomingForm } = require('formidable');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

// WAJIB: matiin body parser bawaan Vercel
// Di CommonJS, config export begini
module.exports.config = {
    api: { bodyParser: false }
};

async function ezremove(filePath) {
    const form = new FormData();
    form.append('image_file', fs.createReadStream(filePath), path.basename(filePath));

    let create = null;
    try {
        const resp = await axios.post(
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
                timeout: 25000,
            }
        );
        create = resp.data;
    } catch (e) {
        console.error('[ezremove] create-job failed:', e.message);
        return { status: 'error', detail: e.message };
    }

    if (!create?.result?.job_id) {
        console.error('[ezremove] no job_id in response:', JSON.stringify(create));
        return { status: 'error', detail: 'No job_id' };
    }

    const job = create.result.job_id;
    console.log('[ezremove] job created:', job);

    // Poll hasil — max 12x @ 3 detik = 36 detik
    for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 3000));

        let check = null;
        try {
            const checkResp = await axios.get(
                `https://api.ezremove.ai/api/ez-remove/watermark-remove/get-job/${job}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'origin': 'https://ezremove.ai',
                        'referer': 'https://ezremove.ai/',
                        'product-serial': 'sr-' + Date.now()
                    },
                    timeout: 8000,
                }
            );
            check = checkResp.data;
        } catch (e) {
            console.warn(`[ezremove] poll ${i+1} failed:`, e.message);
            continue;
        }

        console.log(`[ezremove] poll ${i+1} code:`, check?.code);

        // Sukses
        if (check?.code === 100000 && check?.result?.output?.length) {
            return { job, result: check.result.output[0] };
        }

        // Masih processing (300001) → lanjut poll
        if (check?.code === 300001) continue;

        // Code lain → hentikan
        break;
    }

    return { status: 'processing', job };
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Parse multipart form — max 10MB
        const form = new IncomingForm({
            maxFileSize: 10 * 1024 * 1024,
            keepExtensions: true,
        });

        const [, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    console.error('[parse] error:', err.message);
                    reject(err);
                } else {
                    resolve([fields, files]);
                }
            });
        });

        // Support formidable v2 & v3 (array atau langsung object)
        const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;

        if (!imageFile) {
            return res.status(400).json({ success: false, error: 'Tidak ada file yang diupload.' });
        }

        console.log('[remove] file:', imageFile.originalFilename, imageFile.size);

        const result = await ezremove(imageFile.filepath);

        // Cleanup temp file
        try { fs.unlinkSync(imageFile.filepath); } catch {}

        if (result.status === 'error') {
            return res.status(500).json({
                success: false,
                error: 'API gagal memproses gambar. Detail: ' + (result.detail || 'unknown')
            });
        }

        if (result.status === 'processing') {
            return res.status(202).json({
                success: false,
                error: 'Proses timeout, coba lagi dengan gambar lebih kecil.',
                jobId: result.job
            });
        }

        if (result.result) {
            return res.status(200).json({
                success: true,
                jobId: result.job,
                resultUrl: result.result
            });
        }

        return res.status(500).json({ success: false, error: 'Tidak ada hasil dari API.' });

    } catch (error) {
        console.error('[remove] unhandled error:', error);

        // Cek apakah error dari formidable karena file terlalu besar
        if (error.message?.includes('maxFileSize') || error.code === 1009) {
            return res.status(413).json({
                success: false,
                error: 'File terlalu besar! Maksimal 10MB ya bro.'
            });
        }

        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
