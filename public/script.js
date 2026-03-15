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

function processFile(file) {
    // Validasi tipe
    if (!file.type.startsWith('image/')) {
        showToast('⚠️ Harus file gambar bro!', 'error');
        return;
    }
    // Validasi ukuran 10MB
    if (file.size > 10 * 1024 * 1024) {
        showToast('⚠️ File terlalu besar! Maks 10MB', 'error');
        return;
    }

    selectedFile = file;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        originalPreviewUrl = e.target.result;

        // Update drop zone
        const dropZone = document.getElementById('dropZone');
        dropZone.classList.add('has-file');
        document.getElementById('dropContent').innerHTML = `
            <div class="upload-icon">✅</div>
            <div class="upload-title">${file.name}</div>
            <div class="upload-sub">Klik untuk ganti gambar</div>
        `;

        // Show preview bar
        document.getElementById('previewThumb').src = e.target.result;
        document.getElementById('previewName').textContent = file.name;
        document.getElementById('previewSize').textContent = formatBytes(file.size);
        document.getElementById('filePreview').classList.add('show');

        showToast('✅ Gambar siap diproses!', 'success');
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

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }

        resultUrl = data.resultUrl;

        // Set compare slider
        document.getElementById('beforeImg').src = originalPreviewUrl;
        document.getElementById('afterImg').src = resultUrl;

        // Wait for images to load
        await Promise.all([
            waitForImage(document.getElementById('beforeImg')),
            waitForImage(document.getElementById('afterImg')),
        ]);

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
    pct = Math.max(2, Math.min(98, pct));
    document.getElementById('compareAfter').style.width = pct + '%';
    document.getElementById('compareDivider').style.left = pct + '%';
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
