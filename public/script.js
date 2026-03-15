// ============================================
// REMOVE WATERMARK PRO — SCRIPT
// by ryaakbar
// ============================================

let selectedFile = null;
let resultUrl = null;
let originalPreviewUrl = null;
let toastTimer = null;
let isDragging = false;

// ── INIT ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(el => { if (el.isIntersecting) el.target.classList.add('visible'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    const navbar = document.getElementById('navbar');
    const scrollBtns = document.getElementById('scrollBtns');
    window.addEventListener('scroll', () => {
        const s = window.scrollY > 20;
        navbar?.classList.toggle('scrolled', s);
        scrollBtns?.classList.toggle('visible', s);
    });
});

// ── FILE HANDLING ─────────────────────────
function handleFileSelect(input) {
    const file = input.files?.[0];
    if (file) processFile(file);
}

function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.add('dragover');
}
function handleDragLeave(e) {
    document.getElementById('dropZone').classList.remove('dragover');
}
function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
}


// ── IMAGE COMPRESSION ─────────────────────
// Compress gambar di frontend sebelum upload
// Target: max 3MB, max 2000px, quality 0.85
async function compressImage(file) {
    return new Promise((resolve) => {
        const MAX_SIZE = 3 * 1024 * 1024; // 3MB
        const MAX_DIM  = 2000;            // 2000px
        const QUALITY  = 0.85;

        // Kalau udah kecil, langsung return
        if (file.size <= MAX_SIZE) { resolve(file); return; }

        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            // Scale down kalau dimensi terlalu besar
            if (width > MAX_DIM || height > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) { resolve(file); return; }
                const compressed = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                });
                console.log(`[compress] ${(file.size/1024/1024).toFixed(1)}MB → ${(compressed.size/1024/1024).toFixed(1)}MB`);
                resolve(compressed);
            }, 'image/jpeg', QUALITY);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

function processFile(file) {
    // Validasi tipe
    if (!file.type.startsWith('image/')) {
        showToast('⚠️ Harus file gambar bro!', 'error');
        return;
    }
    // Validasi ukuran - max 20MB (akan di-compress otomatis ke <3MB)
    if (file.size > 20 * 1024 * 1024) {
        showToast('⚠️ File terlalu besar! Maks 20MB ya bro', 'error');
        return;
    }

    // Preview original dulu
    const reader = new FileReader();
    reader.onload = async (e) => {
        originalPreviewUrl = e.target.result;

        // Update drop zone sementara
        const dropZone = document.getElementById('dropZone');
        dropZone.classList.add('has-file');
        document.getElementById('dropContent').innerHTML = `
            <div class="upload-icon">⏳</div>
            <div class="upload-title">Mengoptimalkan gambar...</div>
            <div class="upload-sub">Sedang kompres otomatis</div>
        `;

        // Compress kalau perlu
        const compressed = await compressImage(file);
        selectedFile = compressed;

        const wasCompressed = compressed.size < file.size;
        const sizeInfo = wasCompressed
            ? `${formatBytes(file.size)} → ${formatBytes(compressed.size)} ✓`
            : formatBytes(file.size);

        // Update drop zone final
        document.getElementById('dropContent').innerHTML = `
            <div class="upload-icon">✅</div>
            <div class="upload-title">${file.name}</div>
            <div class="upload-sub">${wasCompressed ? '✨ Auto-compressed · Klik untuk ganti' : 'Klik untuk ganti gambar'}</div>
        `;

        // Show preview bar
        document.getElementById('previewThumb').src = e.target.result;
        document.getElementById('previewName').textContent = file.name;
        document.getElementById('previewSize').textContent = sizeInfo;
        document.getElementById('filePreview').classList.add('show');

        showToast(wasCompressed ? `✅ Dikompres otomatis: ${formatBytes(compressed.size)}` : '✅ Gambar siap diproses!', 'success');
    };
    reader.readAsDataURL(file);
}

function clearFile() {
    selectedFile = null;
    originalPreviewUrl = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').classList.remove('show');
    const dropZone = document.getElementById('dropZone');
    dropZone.classList.remove('has-file');
    document.getElementById('dropContent').innerHTML = `
        <div class="upload-icon">🖼️</div>
        <div class="upload-title">Klik atau drag foto ke sini</div>
        <div class="upload-sub">Max 10MB · Gambar akan diproses AI</div>
        <div class="upload-formats">
            <span class="format-tag">JPG</span>
            <span class="format-tag">PNG</span>
            <span class="format-tag">WEBP</span>
            <span class="format-tag">BMP</span>
        </div>
    `;
    showToast('🗑️ File dihapus', '');
}

// ── REMOVE WATERMARK ──────────────────────
async function removeWatermark() {
    if (!selectedFile) {
        showToast('⚠️ Upload gambar dulu bro!', 'error');
        return;
    }

    setLoading(true);
    hideResult();
    hideError();

    // Animasi steps
    animateSteps();

    try {
        const formData = new FormData();
        formData.append('image', selectedFile);

        const res = await fetch('/api/remove', {
            method: 'POST',
            body: formData,
        });

        // Safe JSON parse — backend bisa return HTML kalau server error
        let data;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            data = await res.json();
        } else {
            const rawText = await res.text();
            console.error('[remove] non-JSON response:', rawText.slice(0, 200));
            throw new Error(
                res.status === 413 ? 'File terlalu besar! Coba kompres gambar dulu bro.' :
                res.status === 504 ? 'Server timeout. Coba lagi dengan gambar lebih kecil.' :
                res.status === 500 ? 'Server error. Coba lagi beberapa saat.' :
                `Server error HTTP ${res.status}`
            );
        }

        if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }

        resultUrl = data.resultUrl;

        // Set compare slider
        const beforeImg = document.getElementById('beforeImg');
        const afterImg  = document.getElementById('afterImg');

        // Proxy gambar result lewat backend biar ga kena CORS
        const proxiedUrl = '/api/image?url=' + encodeURIComponent(resultUrl);

        beforeImg.src = originalPreviewUrl;
        afterImg.src  = proxiedUrl;

        // Wait for both images to load
        // Kalau proxy gagal (network/CORS), fallback ke URL langsung
        afterImg.onerror = () => {
            console.warn('[compare] proxy failed, trying direct URL');
            afterImg.onerror = null;
            afterImg.src = resultUrl;
        };

        await Promise.all([
            waitForImage(beforeImg),
            waitForImage(afterImg),
        ]);

        // Sinkronkan ukuran compare wrap dengan before image
        // supaya after image tidak zoom/crop
        const wrap = document.getElementById('compareWrap');
        wrap.style.height = beforeImg.offsetHeight + 'px';

        // Reset slider ke tengah
        document.getElementById('compareAfter').style.width = '50%';
        document.getElementById('compareDivider').style.left = '50%';

        setLoading(false);
        showResult();
        showToast('🔥 Watermark berhasil dihapus!', 'success');
        setTimeout(() => {
            document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);

    } catch (err) {
        setLoading(false);
        showError(err.message);
        showToast('❌ ' + err.message, 'error');
    }
}

function waitForImage(img) {
    return new Promise(resolve => {
        if (img.complete) { resolve(); return; }
        img.onload = resolve;
        img.onerror = resolve;
    });
}

// ── DOWNLOAD ──────────────────────────────
async function downloadResult() {
    if (!resultUrl) return;
    showToast('⬇️ Mendownload...', 'success');
    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: resultUrl }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `removed-wm-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
    } catch {
        // Fallback: buka langsung
        window.open(resultUrl, '_blank');
        showToast('💡 Dibuka di tab baru, save manual!', 'success');
    }
}

// ── RESET ─────────────────────────────────
function resetAll() {
    clearFile();
    hideResult();
    hideError();
    resultUrl = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('🔄 Siap upload gambar baru!', '');
}

// ── COMPARE SLIDER ────────────────────────
let compareActive = false;

function startDrag(e) {
    compareActive = true;
    updateCompare(e.clientX);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', stopDrag);
}
function startDragTouch(e) {
    compareActive = true;
    document.addEventListener('touchmove', onDragMoveTouch, { passive: false });
    document.addEventListener('touchend', stopDrag);
}
function onDragMove(e) {
    if (!compareActive) return;
    updateCompare(e.clientX);
}
function onDragMoveTouch(e) {
    if (!compareActive) return;
    e.preventDefault();
    updateCompare(e.touches[0].clientX);
}
function stopDrag() {
    compareActive = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onDragMoveTouch);
    document.removeEventListener('touchend', stopDrag);
}
function updateCompare(clientX) {
    const wrap = document.getElementById('compareWrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(1, Math.min(99, pct));

    const afterDiv = document.getElementById('compareAfter');
    const divider  = document.getElementById('compareDivider');
    const afterImg = document.getElementById('afterImg');

    // Lebar after div = pct dari wrap
    afterDiv.style.width = pct + '%';
    divider.style.left   = pct + '%';

    // After image lebar = 100% dari wrap (bukan dari afterDiv)
    // Ini yang cegah zoom effect
    afterImg.style.width = (100 / pct * 100) + '%';
    afterImg.style.maxWidth = 'none';
}

// ── LOADING STEPS ANIMATION ───────────────
let stepTimer = null;
function animateSteps() {
    const steps = ['step1','step2','step3','step4'];
    let current = 0;
    // Reset
    steps.forEach(s => {
        const el = document.getElementById(s);
        el.classList.remove('active','done');
    });
    document.getElementById('step1').classList.add('active');

    stepTimer = setInterval(() => {
        if (current < steps.length - 1) {
            document.getElementById(steps[current]).classList.remove('active');
            document.getElementById(steps[current]).classList.add('done');
            current++;
            document.getElementById(steps[current]).classList.add('active');
        }
    }, 5000);
}
function stopStepAnimation() {
    clearInterval(stepTimer);
    ['step1','step2','step3','step4'].forEach(s => {
        document.getElementById(s).classList.remove('active');
        document.getElementById(s).classList.add('done');
    });
}

// ── UI HELPERS ────────────────────────────
function setLoading(show) {
    const btn = document.getElementById('removeBtn');
    document.getElementById('loading').classList.toggle('hidden', !show);
    btn.disabled = show;
    btn.innerHTML = show
        ? '<i class="fa-solid fa-spinner fa-spin"></i><span>Memproses...</span>'
        : '<i class="fa-solid fa-wand-magic-sparkles"></i><span>Remove Watermark</span><span class="btn-arrow">→</span>';
    if (!show) stopStepAnimation();
}
function showResult()  { document.getElementById('resultCard').classList.remove('hidden'); }
function hideResult()  { document.getElementById('resultCard').classList.add('hidden'); }
function showError(msg) {
    document.getElementById('errorText').textContent = msg;
    document.getElementById('errorCard').classList.remove('hidden');
}
function hideError()   { document.getElementById('errorCard').classList.add('hidden'); }

// ── UTILS ─────────────────────────────────
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showToast(msg, type = '') {
    clearTimeout(toastTimer);
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
