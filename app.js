// ===================== STATE =====================
let files = [];
let idCtr = 0;
let useGrayscale = false;
let compressMode = 'standar';   // 'standar' | 'aman'
let keepTransparency = true;
let cancelRequested = false;

const presets = {
  ringan:   { q: 80, hint: "Kualitas tinggi, Compress ringan, cocok untuk dokumen penting" },
  sedang:   { q: 60, hint: "Kualitas sedang, keseimbangan ukuran dan kualitas visual" },
  tinggi:   { q: 35, hint: "Kualitas rendah, file jauh lebih kecil, gambar agak berkurang" },
  maksimal: { q: 10, hint: "Compress maksimal, gambar sangat terCompress, cocok untuk arsip" }
};

// ===================== SETTINGS =====================
function setPreset(name, btn) {
  document.querySelectorAll('.preset-btn').forEach(b => {
    if(b.closest('.setting-item') === btn.closest('.setting-item')) b.classList.remove('active');
  });
  btn.classList.add('active');
  const p = presets[name];
  document.getElementById('qSlider').value = p.q;
  document.getElementById('qVal').textContent = p.q + '%';
  document.getElementById('qLabel').textContent = p.q + '%';
  document.getElementById('presetHint').innerHTML = p.hint;
  renderList();
}
function onSlider(el) {
  document.getElementById('qVal').textContent = el.value + '%';
  document.getElementById('qLabel').textContent = el.value + '%';
  document.querySelectorAll('.preset-btns')[0].querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('presetHint').innerHTML = 'Kualitas manual';
  renderList();
}
function setColor(gray, btn) {
  useGrayscale = gray;
  btn.closest('.preset-btns').querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderList();
}

function setMode(mode) {
  compressMode = mode;
  document.getElementById('modeStandar').classList.toggle('active', mode === 'standar');
  document.getElementById('modeAman').classList.toggle('active', mode === 'aman');
  // Mode Aman: otomatis aktifkan setting yang melindungi shape
  if (mode === 'aman') {
    document.getElementById('minSizeSelect').value = '200';
    keepTransparency = true;
    document.getElementById('keepTransBtn').classList.add('active');
    document.getElementById('dropTransBtn').classList.remove('active');
    document.getElementById('scaleSelect').value = '1.0';
  } else {
    document.getElementById('minSizeSelect').value = '100';
    document.getElementById('scaleSelect').value = '0.75';
  }
  renderList();
}

function setKeepTrans(keep, btn) {
  keepTransparency = keep;
  btn.closest('.preset-btns').querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderList();
}

function toggleAdvanced(btn) {
  btn.classList.toggle('open');
  document.getElementById('advancedBody').classList.toggle('open');
}

// ===================== DROP ZONE =====================
const dz = document.getElementById('dropzone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('dragover');
  addFiles([...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf')));
});
document.getElementById('fileInput').addEventListener('change', e => {
  addFiles([...e.target.files]);
  e.target.value = '';
});

function addFiles(arr) {
  arr.forEach(f => {
    const entry = { id: ++idCtr, file: f, origSize: f.size, result: null, status: 'wait', name: f.name, pages: null };
    files.push(entry);
    // Baca jumlah halaman di background
    f.arrayBuffer().then(buf => {
      PDFLib.PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false })
        .then(doc => { entry.pages = doc.getPageCount(); renderList(); })
        .catch(() => {});
    }).catch(() => {});
  });
  renderList();
}
function removeFile(id) { files = files.filter(f => f.id !== id); renderList(); }
function clearAll() { files = []; document.getElementById('summary').classList.remove('show'); renderList(); }

// ===================== ESTIMASI =====================
function estimateSize(origSize) {
  const quality  = parseInt(document.getElementById('qSlider').value) / 100;
  const scale    = parseFloat(document.getElementById('scaleSelect').value);
  const gray     = useGrayscale;
  const mode     = compressMode;

  // Proporsi konten gambar: mode standar (scan/foto) ≈ 85%, mode aman (Word) ≈ 55%
  const imgRatio   = mode === 'standar' ? 0.85 : 0.55;
  const textRatio  = 1 - imgRatio;

  // Faktor kompresi gambar: skala area × kualitas JPEG
  const scaleFactor = scale * scale;
  const qFactor = 0.08 + quality * 0.62; // q=10% → ~0.14, q=60% → ~0.45, q=80% → ~0.58
  const grayFactor  = gray ? 0.72 : 1.0;

  const estImg  = origSize * imgRatio * scaleFactor * qFactor * grayFactor;
  const estText = origSize * textRatio * 0.95; // teks/struktur hampir tidak berubah
  const est = estImg + estText;

  // Jangan biarkan estimasi > 95% ukuran asli (selalu ada sedikit penghematan)
  const clamped = Math.min(est, origSize * 0.95);
  return {
    low:  Math.round(clamped * 0.75),
    high: Math.round(clamped * 1.25 < origSize * 0.95 ? clamped * 1.25 : origSize * 0.95)
  };
}

// ===================== RENDER =====================
function renderList() {
  const wa = document.getElementById('workArea');
  const list = document.getElementById('fileList');
  if (!files.length) { wa.style.display = 'none'; list.innerHTML = ''; return; }
  wa.style.display = 'block';

  const totalOrig = files.reduce((s, f) => s + f.origSize, 0);
  document.getElementById('fileCount').textContent =
    files.length + ' file' + (files.length > 1 ? 's' : '') + ' · ' + fmt(totalOrig);

  const doneCount = files.filter(f => f.status === 'done').length;
  document.getElementById('dlAllBtn').style.display = doneCount > 1 ? 'inline-block' : 'none';
  document.getElementById('dlZipBtn').style.display = doneCount > 1 ? 'inline-block' : 'none';

  list.innerHTML = files.map(f => {
    const tag = {
      wait:  '<span class="tag tag-wait">Menunggu</span>',
      proc:  '<span class="tag tag-proc">Memproses...</span>',
      done:  '<span class="tag tag-done">Selesai</span>',
      error: '<span class="tag tag-err">Error</span>'
    }[f.status] || '';

    let rightHtml = '', progHtml = '', dlBtn = '';

    if (f.status === 'wait') {
      const est = estimateSize(f.origSize);
      rightHtml = `<div class="est-badge">${fmt(f.origSize)} →<br><strong>~${fmt(est.low)} – ${fmt(est.high)}</strong></div>`;
    }
    if (f.status === 'proc') {
      progHtml = `<div class="progress-wrap"><div class="progress-bar" id="prog-${f.id}" style="width:${f.progress||0}%"></div></div>`;
    }
    if (f.status === 'done' && f.result) {
      const rb = f.result.byteLength;
      const saved = f.origSize - rb;
      const pct = ((saved / f.origSize) * 100).toFixed(1);
      const green = saved > 0;
      rightHtml = `
        <div class="size-compare">${fmt(f.origSize)} → </div>
        <div class="size-result ${green?'green':'gray'}">${fmt(rb)}</div>
        <span class="saving-pill ${green?'green':'gray'}">${green ? '-'+pct+'%' : 'tidak berubah'}</span>`;
      dlBtn = `<button class="btn-dl" onclick="dlFile(${f.id})">Unduh</button>`;
    }
    if (f.status === 'error') {
      rightHtml = `<div class="est-badge" style="color:var(--danger);text-align:right">${f.errorMsg || 'Gagal diproses'}</div>`;
    }
    return `<div class="file-card" id="card-${f.id}">
      <div class="file-icon">PDF</div>
      <div class="file-info">
        <div class="file-name">${esc(f.name)}</div>
        <div class="file-meta">${fmt(f.origSize)}${f.pages ? ' · ' + f.pages + ' hal.' : ''} &middot; ${tag}</div>
        ${progHtml}
      </div>
      <div class="file-right">${rightHtml}</div>
      <div class="file-btns">
        ${dlBtn}
        <button class="btn-rm" onclick="removeFile(${f.id})" title="Hapus">✕</button>
      </div>
    </div>`;
  }).join('');
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(2) + ' MB';
}

// ===================== COMPRESS =====================
async function compressAll() {
  const quality   = parseInt(document.getElementById('qSlider').value) / 100;
  const scale     = parseFloat(document.getElementById('scaleSelect').value);
  const gray      = useGrayscale;
  const minSize   = parseInt(document.getElementById('minSizeSelect').value);
  const keepTrans = keepTransparency;
  const opts = { quality, scale, gray, minSize, keepTrans, mode: compressMode };
  const pending = files.filter(f => f.status === 'wait' || f.status === 'error');
  if (!pending.length) { toast('Semua file sudah dikompres.'); return; }

  cancelRequested = false;
  document.getElementById('compressBtn').disabled = true;
  document.getElementById('cancelBtn').style.display = 'inline-block';

  for (const f of pending) {
    if (cancelRequested) {
      toast('Proses dihentikan.');
      break;
    }
    f.status = 'proc'; f.progress = 0; f.errorMsg = ''; renderList();
    try {
      const buf = await f.file.arrayBuffer();
      f.result = await compressPDF(buf, opts, f.id);
      f.status = 'done';
    } catch(e) {
      console.error(e);
      f.status = 'error';
      f.errorMsg = e && e.message ? e.message.substring(0, 60) : 'Gagal diproses';
    }
    renderList();
  }

  document.getElementById('compressBtn').disabled = false;
  document.getElementById('cancelBtn').style.display = 'none';
  cancelRequested = false;
  showSummary();
}

function requestCancel() {
  cancelRequested = true;
  document.getElementById('cancelBtn').textContent = '⏳ Menghentikan...';
  document.getElementById('cancelBtn').disabled = true;
}

async function compressPDF(arrayBuffer, opts, fileId) {
  const { quality, scale, gray, minSize, keepTrans, mode } = opts;
  const { PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } = PDFLib;

  // Load dengan toleransi error
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false
  });

  // Hapus metadata
  try {
    pdfDoc.setTitle(''); pdfDoc.setAuthor('');
    pdfDoc.setSubject(''); pdfDoc.setKeywords([]);
    pdfDoc.setProducer(''); pdfDoc.setCreator('');
  } catch(e) {}

  // Enumerate semua indirect objects
  const entries = pdfDoc.context.enumerateIndirectObjects();
  const imageEntries = [];

  for (const [ref, obj] of entries) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    const subtype = dict.get(PDFName.of('Subtype'));
    if (!subtype) continue;
    const subtypeStr = subtype.asString ? subtype.asString() : String(subtype);
    if (subtypeStr !== '/Image') continue;

    const w = dict.get(PDFName.of('Width'));
    const h = dict.get(PDFName.of('Height'));
    if (!w || !h) continue;

    imageEntries.push({ ref, obj, dict,
      w: w.asNumber ? w.asNumber() : Number(w),
      h: h.asNumber ? h.asNumber() : Number(h)
    });
  }

  const total = imageEntries.length;
  let processed = 0;

  for (const { ref, obj, dict, w, h } of imageEntries) {
    try {
      // GUARD 1: Lewati gambar kecil (ikon, shape, logo dari Word)
      if (minSize > 0 && (w < minSize || h < minSize)) { processed++; continue; }

      // GUARD 2: Pertahankan transparansi. Gambar dengan SMask atau Mask
      // adalah shape/grafik bertransparansi. Jika di JPEG, latarnya jadi
      // kotak solid dan bentuk jadi berantakan. Lewati saja.
      const hasSMask = dict.get(PDFName.of('SMask'));
      const hasMask  = dict.get(PDFName.of('Mask'));
      if (keepTrans && (hasSMask || hasMask)) { processed++; continue; }

      // GUARD 3: Mode Aman, lewati gambar dengan filter selain JPEG/Flate
      // (CCITT, JBIG2 dll adalah teks scan yang sebaiknya tidak diutak-atik)
      const filterCheck = dict.get(PDFName.of('Filter'));
      const filterCheckStr = filterCheck ? (filterCheck.asString ? filterCheck.asString() : String(filterCheck)) : '';
      if (mode === 'aman' && (filterCheckStr.includes('CCITT') || filterCheckStr.includes('JBIG') || filterCheckStr.includes('JPX'))) {
        processed++; continue;
      }

      // Ambil raw bytes dari stream (sebelum decode) untuk cek filter
      const rawContents = obj.contents;
      if (!rawContents || rawContents.length === 0) continue;

      // Deteksi apakah sudah JPEG (DCTDecode), kalau iya pakai langsung
      const filterObj = dict.get(PDFName.of('Filter'));
      const filterStr = filterObj ? (filterObj.asString ? filterObj.asString() : String(filterObj)) : '';
      const isJpeg = filterStr.includes('DCTDecode') || filterStr.includes('DCT');

      // Tentukan mime type untuk blob
      // Jika JPEG: pakai raw contents langsung (sudah JPEG)
      // Jika lain: decode dulu, lalu bungkus sebagai raw bitmap via canvas
      let imgBitmap;
      let originalBytes;

      if (isJpeg) {
        // Sudah JPEG — langsung buat blob
        originalBytes = rawContents;
        const blob = new Blob([rawContents], { type: 'image/jpeg' });
        try {
          imgBitmap = await createImageBitmap(blob);
        } catch(e) { continue; }
      } else {
        // Decode stream (FlateDecode, LZW, dll) → raw pixel bytes
        let decoded;
        try {
          decoded = decodePDFRawStream(obj).decode();
        } catch(e) { continue; }
        if (!decoded || decoded.length === 0) continue;
        originalBytes = decoded;

        // Cek color space untuk tahu channel count
        const csObj = dict.get(PDFName.of('ColorSpace'));
        const csStr = csObj ? (csObj.asString ? csObj.asString() : String(csObj)) : '/DeviceRGB';

        // Render raw pixels ke canvas pakai ImageData
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = w; tmpCanvas.height = h;
        const tmpCtx = tmpCanvas.getContext('2d');
        const imgData = tmpCtx.createImageData(w, h);
        const px = decoded;
        const pixelCount = w * h;

        if (csStr.includes('Gray')) {
          // 1 channel grayscale
          for (let i = 0; i < pixelCount; i++) {
            const v = px[i] ?? 0;
            imgData.data[i*4]   = v;
            imgData.data[i*4+1] = v;
            imgData.data[i*4+2] = v;
            imgData.data[i*4+3] = 255;
          }
        } else if (csStr.includes('CMYK')) {
          // 4 channel CMYK → RGB
          for (let i = 0; i < pixelCount; i++) {
            const C = (px[i*4]   ?? 0) / 255;
            const M = (px[i*4+1] ?? 0) / 255;
            const Y = (px[i*4+2] ?? 0) / 255;
            const K = (px[i*4+3] ?? 0) / 255;
            imgData.data[i*4]   = Math.round(255*(1-C)*(1-K));
            imgData.data[i*4+1] = Math.round(255*(1-M)*(1-K));
            imgData.data[i*4+2] = Math.round(255*(1-Y)*(1-K));
            imgData.data[i*4+3] = 255;
          }
        } else {
          // RGB 3 channel (paling umum untuk non-JPEG)
          for (let i = 0; i < pixelCount; i++) {
            imgData.data[i*4]   = px[i*3]   ?? 0;
            imgData.data[i*4+1] = px[i*3+1] ?? 0;
            imgData.data[i*4+2] = px[i*3+2] ?? 0;
            imgData.data[i*4+3] = 255;
          }
        }
        tmpCtx.putImageData(imgData, 0, 0);
        try {
          imgBitmap = await createImageBitmap(tmpCanvas);
        } catch(e) { continue; }
      }

      // Hitung dimensi output setelah scale
      const newW = Math.max(1, Math.round(w * scale));
      const newH = Math.max(1, Math.round(h * scale));

      // Gambar ke canvas output
      const canvas = document.createElement('canvas');
      canvas.width  = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      if (gray) ctx.filter = 'grayscale(1)';
      ctx.drawImage(imgBitmap, 0, 0, newW, newH);
      imgBitmap.close && imgBitmap.close();

      // Encode ke JPEG
      const jpegBlob = await new Promise(res =>
        canvas.toBlob(b => res(b), 'image/jpeg', quality)
      );
      if (!jpegBlob) continue;

      const jpegBuf = await jpegBlob.arrayBuffer();
      const jpegBytes = new Uint8Array(jpegBuf);

      // Hanya replace jika hasilnya lebih kecil dari original
      if (jpegBytes.length >= originalBytes.length && scale >= 1.0) continue;

      // *** REPLACE STREAM CONTENT ***
      obj.contents = jpegBytes;

      // Update dictionary
      dict.set(PDFName.of('Filter'),           PDFName.of('DCTDecode'));
      dict.set(PDFName.of('Width'),            PDFNumber.of(newW));
      dict.set(PDFName.of('Height'),           PDFNumber.of(newH));
      dict.set(PDFName.of('Length'),           PDFNumber.of(jpegBytes.length));
      dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      if (gray) {
        dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'));
      } else {
        dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
      }
      dict.delete(PDFName.of('DecodeParms'));
      if (!keepTrans) dict.delete(PDFName.of('SMask'));

    } catch(e) {
      // skip gambar bermasalah
    }

    processed++;
    const prog = document.getElementById(`prog-${fileId}`);
    if (prog) prog.style.width = (total > 0 ? Math.round((processed/total)*90) : 50) + '%';
    // yield to UI
    await new Promise(r => setTimeout(r, 0));
  }

  const prog = document.getElementById(`prog-${fileId}`);
  if (prog) prog.style.width = '95%';

  const out = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });

  if (prog) prog.style.width = '100%';
  return out;
}

// ===================== DOWNLOAD =====================
function dlFile(id) {
  const f = files.find(x => x.id === id);
  if (!f || !f.result) return;
  const blob = new Blob([f.result], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const addSuffix = document.getElementById('addSuffix').checked;
  a.download = addSuffix ? f.name.replace(/\.pdf$/i, '') + '_compressed.pdf' : f.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function downloadAll() {
  files.filter(f => f.status === 'done').forEach((f, i) =>
    setTimeout(() => dlFile(f.id), i * 500)
  );
}

async function downloadZip() {
  const done = files.filter(f => f.status === 'done' && f.result);
  if (!done.length) return;
  const addSuffix = document.getElementById('addSuffix').checked;

  // Buat ZIP manual (format ZIP sederhana tanpa library eksternal)
  const zipParts = [];
  const centralDir = [];
  let offset = 0;

  for (const f of done) {
    const fileName = addSuffix
      ? f.name.replace(/\.pdf$/i, '') + '_compressed.pdf'
      : f.name;
    const fileBytes = new Uint8Array(f.result);
    const nameBytes = new TextEncoder().encode(fileName);

    // Local file header
    const localHeader = buildLocalHeader(nameBytes, fileBytes);
    centralDir.push({ nameBytes, fileBytes, offset, localHeader });
    offset += localHeader.length + fileBytes.length;
    zipParts.push(localHeader, fileBytes);
  }

  // Central directory
  const cdParts = [];
  let cdSize = 0;
  const cdOffset = offset;
  for (const entry of centralDir) {
    const cd = buildCentralDir(entry.nameBytes, entry.fileBytes, entry.offset);
    cdParts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory
  const eocd = buildEOCD(centralDir.length, cdSize, cdOffset);

  // Gabungkan semua
  const allParts = [...zipParts, ...cdParts, eocd];
  const totalSize = allParts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of allParts) { out.set(p, pos); pos += p.length; }

  const blob = new Blob([out], { type: 'application/zip' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'compressed_pdf.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('ZIP berhasil diunduh!');
}

function writeUint16LE(val) {
  return new Uint8Array([val & 0xff, (val >> 8) & 0xff]);
}
function writeUint32LE(val) {
  return new Uint8Array([val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff, (val >> 24) & 0xff]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildLocalHeader(nameBytes, fileBytes) {
  const crc  = crc32(fileBytes);
  const size = fileBytes.length;
  const parts = [
    new Uint8Array([0x50,0x4B,0x03,0x04]), // signature
    writeUint16LE(20),    // version needed
    writeUint16LE(0),     // flags
    writeUint16LE(0),     // compression: stored
    writeUint16LE(0),     // mod time
    writeUint16LE(0),     // mod date
    writeUint32LE(crc),
    writeUint32LE(size),  // compressed size
    writeUint32LE(size),  // uncompressed size
    writeUint16LE(nameBytes.length),
    writeUint16LE(0),     // extra field len
    nameBytes
  ];
  const total = parts.reduce((s,p) => s+p.length, 0);
  const out = new Uint8Array(total);
  let p = 0; for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

function buildCentralDir(nameBytes, fileBytes, localOffset) {
  const crc  = crc32(fileBytes);
  const size = fileBytes.length;
  const parts = [
    new Uint8Array([0x50,0x4B,0x01,0x02]), // signature
    writeUint16LE(20),    // version made by
    writeUint16LE(20),    // version needed
    writeUint16LE(0),     // flags
    writeUint16LE(0),     // compression: stored
    writeUint16LE(0),     // mod time
    writeUint16LE(0),     // mod date
    writeUint32LE(crc),
    writeUint32LE(size),
    writeUint32LE(size),
    writeUint16LE(nameBytes.length),
    writeUint16LE(0),     // extra
    writeUint16LE(0),     // comment
    writeUint16LE(0),     // disk start
    writeUint16LE(0),     // int attr
    writeUint32LE(0),     // ext attr
    writeUint32LE(localOffset),
    nameBytes
  ];
  const total = parts.reduce((s,p) => s+p.length, 0);
  const out = new Uint8Array(total);
  let p = 0; for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

function buildEOCD(count, cdSize, cdOffset) {
  const parts = [
    new Uint8Array([0x50,0x4B,0x05,0x06]),
    writeUint16LE(0),         // disk number
    writeUint16LE(0),         // disk with cd
    writeUint16LE(count),     // entries on disk
    writeUint16LE(count),     // total entries
    writeUint32LE(cdSize),
    writeUint32LE(cdOffset),
    writeUint16LE(0)          // comment length
  ];
  const total = parts.reduce((s,p) => s+p.length, 0);
  const out = new Uint8Array(total);
  let p = 0; for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

// ===================== SUMMARY =====================
function showSummary() {
  const done = files.filter(f => f.status === 'done' && f.result);
  if (!done.length) return;
  const origTotal = done.reduce((s,f) => s + f.origSize, 0);
  const compTotal = done.reduce((s,f) => s + f.result.byteLength, 0);
  const saved     = origTotal - compTotal;
  const pct       = ((saved/origTotal)*100).toFixed(1);
  document.getElementById('summaryText').textContent =
    `${done.length} file selesai, hemat ${fmt(saved)} (${pct}%) dari total ${fmt(origTotal)}`;
  document.getElementById('summary').classList.add('show');
}

// ===================== THEME =====================
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeBtn').textContent = dark ? '🌙 Gelap' : '☀️ Terang';
}

// ===================== QRIS FALLBACK =====================
function qrisFallback() {
  const box = document.getElementById('qrisBox');
  if (box) {
    box.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text3);line-height:1.6">Gambar QRIS gagal dimuat.<br><a href="https://drive.google.com/file/d/133Ct_k-ql0PXklNLgQeWGLswIajbxKtg/view" target="_blank" style="color:var(--accent2)">Buka QRIS di Google Drive</a></div>';
  }
}

// ===================== STORY TOGGLE =====================
function toggleStory(btn) {
  btn.classList.toggle('open');
  document.getElementById('storyBody').classList.toggle('open');
}

// ===================== QRIS MODAL =====================
function openQris()  { document.getElementById('qrisModal').classList.add('show'); }
function closeQris() { document.getElementById('qrisModal').classList.remove('show'); }

// ===================== FEEDBACK =====================
function sendFeedback() {
  const msg = document.getElementById('feedbackText').value.trim();
  if (!msg) { toast('Tuliskan dulu masukannya ya.'); return; }
  const subject = encodeURIComponent('Masukan Aplikasi Compress PDF by Ifan');
  const body    = encodeURIComponent(msg);
  window.location.href = `mailto:muhammad.afifani007@gmail.com?subject=${subject}&body=${body}`;
  document.getElementById('feedbackSent').style.display = 'block';
  document.getElementById('feedbackText').value = '';
}

// ===================== TOAST =====================
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ===================== WELCOME / LANDING PAGE =====================
function openWelcome() {
  document.getElementById('welcomeOverlay').classList.add('show');
}
function closeWelcome() {
  document.getElementById('welcomeOverlay').classList.remove('show');
  localStorage.setItem('pdftools_visited', '1');
}
// Auto-show on first visit
(function checkFirstVisit() {
  if (!localStorage.getItem('pdftools_visited')) {
    setTimeout(openWelcome, 400);
  }
})();

// ===================== TOUR =====================
const tourSteps = [
  {
    selector: '.hub-hero',
    title: 'ENV Working Tools',
    body: 'Selamat datang! Ini kumpulan tools kerja yang berjalan 100% di browser. Ada 3 tools: PDF Tools, Batch File Rename, dan File Organizer.',
    pos: 'bottom',
    action: () => backToHub()
  },
  {
    selector: '.tool-grid',
    title: 'Pilih Tool',
    body: 'Klik kartu untuk membuka tool yang kamu butuhkan. PDF Tools untuk semua kebutuhan PDF. Rename untuk ganti nama file massal. Organizer untuk menata file ke folder.',
    pos: 'bottom'
  },
  {
    selector: '.tabs',
    title: 'Tab PDF Tools',
    body: 'PDF Tools punya 5 tab: Compress, Gabung, Edit Halaman, Split, dan Batch Combine. Klik tab untuk berpindah antar fitur.',
    pos: 'bottom',
    action: () => { showTool('pdf-tools'); switchTab('compress'); }
  },
  {
    selector: '#tabBtnCompress',
    title: 'Compress PDF',
    body: 'Kecilkan ukuran file PDF. Cocok untuk PDF hasil scan atau export dari Word dan Excel. Upload file, pilih mode, lalu klik Kompres.',
    pos: 'bottom',
    action: () => switchTab('compress')
  },
  {
    selector: '#tabBtnMerge',
    title: 'Gabung PDF',
    body: 'Satukan beberapa PDF menjadi satu file. Upload file, atur urutan dengan drag, lalu klik Gabung.',
    pos: 'bottom',
    action: () => switchTab('merge')
  },
  {
    selector: '#tabBtnEdit',
    title: 'Edit Halaman PDF',
    body: 'Hapus, ambil, sisipkan, atau putar halaman PDF. Ada preview visual sebelum diproses sehingga kamu bisa cek hasilnya dulu.',
    pos: 'bottom',
    action: () => switchTab('edit')
  },
  {
    selector: '#tabBtnSplit',
    title: 'Split PDF',
    body: 'Pecah PDF menjadi banyak file terpisah. Bisa per halaman atau di titik tertentu. Ada fitur rename otomatis via OCR untuk nama file yang sesuai isi.',
    pos: 'bottom',
    action: () => switchTab('split')
  },
  {
    selector: '#tabBtnBatch',
    title: 'Batch Combine',
    body: 'Upload template Header/Footer PDF, lalu gabungkan ke banyak file sekaligus. Bisa pilih unduh ZIP atau satu per satu. Ada opsi tambah sufiks atau tidak.',
    pos: 'bottom',
    action: () => switchTab('batch')
  },
  {
    selector: '#tab-batch .tool-reset-btn',
    title: 'Tombol Reset',
    body: 'Setiap tool punya tombol Reset di pojok kanan atas. Klik untuk membersihkan semua file dan pengaturan, lalu mulai dari awal.',
    pos: 'bottom'
  },
  {
    selector: '#rn-folderZone',
    title: 'Batch File Rename',
    body: 'Rename banyak file sekaligus. Pilih folder, export daftar ke CSV, isi kolom Nama Baru di Excel, import kembali, preview, lalu eksekusi. Ekstensi file dipertahankan otomatis.',
    pos: 'bottom',
    action: () => showTool('rename')
  },
  {
    selector: '#org-folderZone',
    title: 'File Organizer',
    body: 'Tata file ke subfolder secara otomatis berdasarkan kata kunci pada nama file. Buat rules pemetaan, preview hasilnya, lalu klik Eksekusi.',
    pos: 'bottom',
    action: () => showTool('organize')
  },
  {
    selector: '#mainFooter',
    title: 'Footer dan Kontak',
    body: 'Di footer ada kontak Ifan lewat Gmail, WA, Instagram, dan LinkedIn. Ada form masukan dan donasi via QRIS. Terima kasih sudah menggunakan ENV Working Tools!',
    pos: 'top',
    action: () => backToHub()
  }
];

let tourStep = 0;
let tourActive = false;

function startTourFromHub() {
  startTour();
}

function startTour() {
  tourStep = 0;
  tourActive = true;
  document.getElementById('tourOverlay').classList.add('active');
  setTimeout(() => renderTourStep(), 100);
}

function endTour() {
  tourActive = false;
  document.getElementById('tourOverlay').classList.remove('active');
  document.getElementById('tourSpotlight').style.cssText = '';
  document.getElementById('tourTip').style.cssText = '';
  // Show summary toast
  toast('Tour selesai. Semua fitur sudah dijelaskan.');
}

function tourNext() {
  if (tourStep >= tourSteps.length - 1) {
    endTour();
    return;
  }
  tourStep++;
  renderTourStep();
}

function renderTourStep() {
  const step = tourSteps[tourStep];
  if (!step) return;

  // Run action (e.g. switch tab)
  if (step.action) step.action();

  setTimeout(() => {
    const el = document.querySelector(step.selector);
    if (!el) { tourNext(); return; }

    // Temporarily show hidden element if needed
    let wasHidden = false;
    if (step.showEl && el.style.display === 'none') {
      el.style.display = 'block';
      wasHidden = true;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const pad = 8;
      const spotlight = document.getElementById('tourSpotlight');
      spotlight.style.cssText = `
        left:${rect.left - pad}px;
        top:${rect.top - pad}px;
        width:${rect.width + pad*2}px;
        height:${rect.height + pad*2}px;
      `;

      // Position tooltip
      const tip = document.getElementById('tourTip');
      const tipW = Math.min(310, window.innerWidth * 0.88);
      const tipH = 170;
      const margin = 14;
      let tipLeft, tipTop;

      if (step.pos === 'bottom') {
        tipTop  = rect.bottom + pad + margin;
        tipLeft = Math.max(margin, Math.min(rect.left + rect.width/2 - tipW/2, window.innerWidth - tipW - margin));
        if (tipTop + tipH > window.innerHeight - margin) {
          tipTop = rect.top - pad - tipH - margin;
        }
      } else {
        tipTop  = rect.top - pad - tipH - margin;
        tipLeft = Math.max(margin, Math.min(rect.left + rect.width/2 - tipW/2, window.innerWidth - tipW - margin));
        if (tipTop < margin) {
          tipTop = rect.bottom + pad + margin;
        }
      }

      tip.style.cssText = `left:${tipLeft}px;top:${tipTop}px;width:${tipW}px;`;
      document.getElementById('tourTitle').textContent = step.title;
      document.getElementById('tourBody').textContent  = step.body;

      // Update button
      const btn = document.getElementById('tourNextBtn');
      btn.textContent = tourStep >= tourSteps.length - 1 ? 'Selesai' : 'Lanjut →';

      // Dots
      const dotsEl = document.getElementById('tourDots');
      dotsEl.innerHTML = tourSteps.map((_,i) =>
        `<span class="tour-dot${i===tourStep?' active':''}" onclick="tourJump(${i})"></span>`
      ).join('');

      if (wasHidden) el.style.display = 'none';
    }, 300);
  }, step.action ? 200 : 50);
}

function tourJump(idx) {
  tourStep = idx;
  renderTourStep();
}

// ===================== PAGE PREVIEW =====================
let previewPageUrls   = [];
let previewPageRatios = []; // width/height ratio per page
let previewSelectedPages = new Set();
let previewAbortFlag  = false;
let zoomCurrentPage   = 1;

async function openPagePreview() {
  if (!editFile || !editFilePages) return;
  previewAbortFlag = false;
  previewSelectedPages.clear();
  previewPageUrls   = new Array(editFilePages).fill(null);
  previewPageRatios = new Array(editFilePages).fill(0.707);

  const overlay = document.getElementById('previewOverlay');
  const grid    = document.getElementById('pageGrid');
  const loading = document.getElementById('previewLoading');
  const bar     = document.getElementById('previewProgressBar');

  document.getElementById('previewTitle').textContent = 'Preview Halaman PDF';
  document.getElementById('previewSubtitle').textContent = editFile.name + ' · ' + editFilePages + ' halaman';
  grid.style.display = 'none';
  loading.style.display = 'block';
  bar.style.width = '0%';
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';

  const { PDFDocument } = PDFLib;
  let srcBuf;
  try { srcBuf = await editFile.arrayBuffer(); }
  catch(e) { toast('Gagal membaca file.'); return; }

  const srcDoc = await PDFDocument.load(srcBuf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });

  // Pre-read all page dimensions to build correctly-sized grid
  for (let i = 0; i < editFilePages; i++) {
    try {
      const pg  = srcDoc.getPage(i);
      const rot = pg.getRotation().angle;
      const sz  = pg.getSize();
      const w   = (rot === 90 || rot === 270) ? sz.height : sz.width;
      const h   = (rot === 90 || rot === 270) ? sz.width  : sz.height;
      previewPageRatios[i] = w / h;
    } catch(e) {}
  }

  // Build thumbnail grid with correct aspect ratios
  grid.innerHTML = Array.from({length: editFilePages}, (_,i) => {
    const ratio = previewPageRatios[i] || 0.707;
    const padPct = Math.round((1/ratio) * 100);
    return `
    <div class="page-thumb" id="pt-${i+1}" onclick="togglePreviewPage(${i+1})">
      <div class="page-thumb-inner" style="padding-top:${padPct}%;height:0;position:relative">
        <div class="page-loading" id="pl-${i+1}" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#f8f8f8">
          <div class="page-loading-spinner"></div>
          <span style="font-size:10px;color:var(--text3)">Hal. ${i+1}</span>
        </div>
        <iframe id="pf-${i+1}" style="position:absolute;inset:0;width:100%;height:100%;border:none;display:none" scrolling="no"></iframe>
      </div>
      <div class="page-num">
        Hal. ${i+1}${ratio > 1.05 ? ' · 🔄 Landscape' : ''}
        <button class="page-zoom-btn" onclick="event.stopPropagation();openZoom(${i+1})" title="Perbesar">🔍</button>
      </div>
    </div>`;
  }).join('');

  loading.style.display = 'none';
  grid.style.display = 'grid';
  updatePreviewSelInfo();

  // Render pages sequentially, yield to UI between each
  for (let i = 0; i < editFilePages; i++) {
    if (previewAbortFlag) break;
    try {
      const single = await PDFDocument.create();
      const [pg]   = await single.copyPages(srcDoc, [i]);
      single.addPage(pg);
      const bytes  = await single.save();
      const blob   = new Blob([bytes], { type: 'application/pdf' });
      const url    = URL.createObjectURL(blob);
      previewPageUrls[i] = url;

      const iframe = document.getElementById('pf-'+(i+1));
      const loader = document.getElementById('pl-'+(i+1));
      if (iframe && loader) {
        iframe.src = url + '#toolbar=0&navpanes=0&scrollbar=0&view=Fit';
        iframe.onload = () => { iframe.style.display = 'block'; loader.style.display = 'none'; };
      }
    } catch(e) {
      const loader = document.getElementById('pl-'+(i+1));
      if (loader) { loader.innerHTML = '<span style="font-size:22px">⚠️</span><span style="font-size:10px;color:var(--text3)">Gagal dimuat</span>'; }
    }
    bar.style.width = Math.round(((i+1)/editFilePages)*100) + '%';
    await new Promise(r => setTimeout(r, 0));
  }
}

function closePagePreview() {
  previewAbortFlag = true;
  document.getElementById('previewOverlay').classList.remove('show');
  document.body.style.overflow = '';
}

function togglePreviewPage(n) {
  if (previewSelectedPages.has(n)) previewSelectedPages.delete(n);
  else previewSelectedPages.add(n);
  const el = document.getElementById('pt-'+n);
  if (el) el.classList.toggle('selected', previewSelectedPages.has(n));
  updatePreviewSelInfo();
  if (document.getElementById('zoomOverlay').classList.contains('show') && zoomCurrentPage === n) {
    updateZoomSelBtn();
  }
}

function previewToggleAll() {
  const allSelected = previewSelectedPages.size === editFilePages;
  previewSelectedPages.clear();
  if (!allSelected) for (let i = 1; i <= editFilePages; i++) previewSelectedPages.add(i);
  for (let i = 1; i <= editFilePages; i++) {
    const el = document.getElementById('pt-'+i);
    if (el) el.classList.toggle('selected', previewSelectedPages.has(i));
  }
  updatePreviewSelInfo();
}

function updatePreviewSelInfo() {
  const n  = previewSelectedPages.size;
  const el = document.getElementById('previewSelInfo');
  el.textContent = n ? n + ' halaman dipilih' : '';
}

function applyPageSelection() {
  if (!previewSelectedPages.size) { toast('Belum ada halaman yang dipilih.'); return; }
  const sorted = [...previewSelectedPages].sort((a,b) => a-b);
  const ranges = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) { end = sorted[i]; }
    else { ranges.push(start === end ? String(start) : start+'-'+end); start = end = sorted[i]; }
  }
  ranges.push(start === end ? String(start) : start+'-'+end);
  const str = ranges.join(', ');
  if (editOp === 'insert') document.getElementById('insertPagesInput').value = str;
  else document.getElementById('editPageInput').value = str;
  closePagePreview();
  toast('Pilihan halaman diterapkan!');
}

document.getElementById('previewOverlay').addEventListener('click', function(e) {
  if (e.target === this) closePagePreview();
});

// ─── ZOOM FUNCTIONS ───
function openZoom(pageNum) {
  zoomCurrentPage = pageNum;
  updateZoomView();
  document.getElementById('zoomOverlay').classList.add('show');
}

function closeZoom() {
  document.getElementById('zoomOverlay').classList.remove('show');
}

function zoomNav(dir) {
  const next = zoomCurrentPage + dir;
  if (next < 1 || next > editFilePages) return;
  zoomCurrentPage = next;
  updateZoomView();
}

function updateZoomView() {
  const n     = zoomCurrentPage;
  const url   = previewPageUrls[n-1];
  const ratio = previewPageRatios[n-1] || 0.707;

  document.getElementById('zoomLabel').textContent   = 'Halaman ' + n + (ratio > 1.05 ? ' (Landscape)' : ' (Portrait)');
  document.getElementById('zoomCounter').textContent = n + ' / ' + editFilePages;
  document.getElementById('zoomPrev').disabled = n <= 1;
  document.getElementById('zoomNext').disabled = n >= editFilePages;

  // Set iframe size based on orientation
  const wrap   = document.getElementById('zoomFrameWrap');
  const iframe = document.getElementById('zoomIframe');
  if (ratio > 1.05) {
    // Landscape
    wrap.style.setProperty('--zoom-ratio', 1/ratio);
    iframe.style.width  = 'min(85vw, 860px)';
    iframe.style.height = 'min(calc(85vw / '+ratio.toFixed(3)+'), 75vh)';
  } else {
    // Portrait
    wrap.style.setProperty('--zoom-ratio', ratio);
    iframe.style.height = 'min(82vh, 860px)';
    iframe.style.width  = 'min(calc(82vh * '+ratio.toFixed(3)+'), 75vw)';
  }

  if (url) {
    iframe.src = url + '#toolbar=0&navpanes=0&scrollbar=0&view=Fit';
  } else {
    iframe.src = 'about:blank';
  }
  updateZoomSelBtn();
}

function updateZoomSelBtn() {
  const btn = document.getElementById('zoomSelBtn');
  const sel = previewSelectedPages.has(zoomCurrentPage);
  btn.textContent = sel ? '✓ Dipilih (Klik untuk batal)' : '☐ Pilih Halaman Ini';
  btn.classList.toggle('active', sel);
}

function zoomToggleSelect() {
  togglePreviewPage(zoomCurrentPage);
}

document.getElementById('zoomOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeZoom();
});

// Keyboard navigation for zoom
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('zoomOverlay').classList.contains('show')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); zoomNav(1); }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); zoomNav(-1); }
  if (e.key === 'Escape') closeZoom();
  if (e.key === ' ') { e.preventDefault(); zoomToggleSelect(); }
});

// ===================== TAB SWITCHING =====================
function switchTab(tab) {
  ['compress','merge','edit','split','batch'].forEach(t => {
    document.getElementById('tab-'+t).classList.toggle('active', t === tab);
    document.getElementById('tabBtn'+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle('active', t === tab);
  });
}

// ===================== GABUNG PDF =====================
let mergeFiles = [];
let mergeIdCtr = 0;
let mergeDragId = null;

const mdz = document.getElementById('mergeDropzone');
mdz.addEventListener('dragover', e => { e.preventDefault(); mdz.classList.add('dragover'); });
mdz.addEventListener('dragleave', () => mdz.classList.remove('dragover'));
mdz.addEventListener('drop', e => {
  e.preventDefault(); mdz.classList.remove('dragover');
  mergeAddFiles([...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf')));
});
document.getElementById('mergeFileInput').addEventListener('change', e => {
  mergeAddFiles([...e.target.files]);
  e.target.value = '';
});

function mergeAddFiles(arr) {
  arr.forEach(f => {
    const entry = { id: ++mergeIdCtr, file: f, name: f.name, size: f.size, pages: null };
    mergeFiles.push(entry);
    f.arrayBuffer().then(buf =>
      PDFLib.PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false })
        .then(doc => { entry.pages = doc.getPageCount(); mergeRenderList(); })
        .catch(() => {})
    ).catch(() => {});
  });
  mergeRenderList();
}

function mergeClearAll() { mergeFiles = []; document.getElementById('mergeResultBox').classList.remove('show'); mergeRenderList(); }
function mergeRemoveFile(id) { mergeFiles = mergeFiles.filter(f => f.id !== id); mergeRenderList(); }

function mergeRenderList() {
  const wa = document.getElementById('mergeWorkArea');
  if (!mergeFiles.length) { wa.style.display = 'none'; return; }
  wa.style.display = 'block';
  document.getElementById('mergeFileCount').textContent = mergeFiles.length + ' file dipilih';
  document.getElementById('mergeBtn').disabled = mergeFiles.length < 2;
  const list = document.getElementById('mergeList');
  list.innerHTML = mergeFiles.map((f, i) => `
    <div class="merge-card" id="mc-${f.id}" draggable="true"
         ondragstart="mergeDragStart(${f.id})"
         ondragover="mergeDragOver(event,${f.id})"
         ondragleave="mergeDragLeave(${f.id})"
         ondrop="mergeDrop(event,${f.id})"
         ondragend="mergeDragEnd()">
      <span class="drag-handle">⠿</span>
      <span class="merge-num">${i+1}</span>
      <div class="file-icon" style="width:30px;height:30px;font-size:10px;border-radius:6px">PDF</div>
      <div class="file-info">
        <div class="file-name">${esc(f.name)}</div>
        <div class="file-meta">${fmt(f.size)}${f.pages ? ' · ' + f.pages + ' hal.' : ''}</div>
      </div>
      <button class="btn-rm" onclick="mergeRemoveFile(${f.id})" title="Hapus">✕</button>
    </div>`).join('');
}

function mergeDragStart(id) { mergeDragId = id; document.getElementById('mc-'+id).classList.add('dragging'); }
function mergeDragOver(e, id) { e.preventDefault(); if (id !== mergeDragId) document.getElementById('mc-'+id).classList.add('drag-over'); }
function mergeDragLeave(id) { document.getElementById('mc-'+id).classList.remove('drag-over'); }
function mergeDragEnd() {
  mergeFiles.forEach(f => {
    const el = document.getElementById('mc-'+f.id);
    if (el) { el.classList.remove('dragging'); el.classList.remove('drag-over'); }
  });
  mergeDragId = null;
}
function mergeDrop(e, targetId) {
  e.preventDefault();
  if (!mergeDragId || mergeDragId === targetId) return;
  const fromIdx = mergeFiles.findIndex(f => f.id === mergeDragId);
  const toIdx   = mergeFiles.findIndex(f => f.id === targetId);
  const [item] = mergeFiles.splice(fromIdx, 1);
  mergeFiles.splice(toIdx, 0, item);
  mergeRenderList();
}

async function mergePDFs() {
  if (mergeFiles.length < 2) { toast('Pilih minimal 2 file PDF.'); return; }
  const btn = document.getElementById('mergeBtn');
  btn.disabled = true; btn.textContent = '⏳ Menggabung...';
  try {
    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();
    for (const f of mergeFiles) {
      const buf = await f.file.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const out = await merged.save({ useObjectStreams: true });
    const blob = new Blob([out], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'merged.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    const totalPages = mergeFiles.reduce((s,f) => s + (f.pages || 0), 0);
    document.getElementById('mergeResultText').textContent =
      `${mergeFiles.length} file berhasil digabung · ${totalPages} halaman total · ${fmt(out.byteLength)}`;
    document.getElementById('mergeResultBox').classList.add('show');
    toast('PDF berhasil digabung!');
  } catch(e) {
    console.error(e);
    toast('Gagal menggabung: ' + (e.message || 'Error tidak diketahui'));
  }
  btn.disabled = false; btn.textContent = 'Gabung & Unduh';
}

// ===================== EDIT HALAMAN =====================
let editFile = null;
let editFilePages = 0;
let editOp = 'delete';
let insertFile2 = null;

const edz = document.getElementById('editDropzone');
edz.addEventListener('dragover', e => { e.preventDefault(); edz.classList.add('dragover'); });
edz.addEventListener('dragleave', () => edz.classList.remove('dragover'));
edz.addEventListener('drop', e => {
  e.preventDefault(); edz.classList.remove('dragover');
  const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.pdf'));
  if (f) editLoadFile(f);
});
document.getElementById('editFileInput').addEventListener('change', e => {
  if (e.target.files[0]) editLoadFile(e.target.files[0]);
  e.target.value = '';
});

const idz = document.getElementById('insertDropzone');
idz.addEventListener('dragover', e => { e.preventDefault(); idz.classList.add('dragover'); });
idz.addEventListener('dragleave', () => idz.classList.remove('dragover'));
idz.addEventListener('drop', e => {
  e.preventDefault(); idz.classList.remove('dragover');
  const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.pdf'));
  if (f) insertLoadFile2(f);
});
document.getElementById('insertFileInput').addEventListener('change', e => {
  if (e.target.files[0]) insertLoadFile2(e.target.files[0]);
  e.target.value = '';
});

function editLoadFile(f) {
  editFile = f;
  document.getElementById('editFileName').textContent = f.name;
  document.getElementById('editFileMeta').textContent = fmt(f.size) + ' · Membaca halaman...';
  document.getElementById('editWorkArea').style.display = 'block';
  document.getElementById('previewBtn').style.display = 'none';
  f.arrayBuffer().then(buf =>
    PDFLib.PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false })
      .then(doc => {
        editFilePages = doc.getPageCount();
        document.getElementById('editFileMeta').textContent = fmt(f.size) + ' · ' + editFilePages + ' halaman';
        document.getElementById('previewBtn').style.display = 'inline-block';
      }).catch(() => { document.getElementById('editFileMeta').textContent = fmt(f.size) + ' · Gagal membaca halaman'; })
  ).catch(() => {});
}

function insertLoadFile2(f) {
  insertFile2 = f;
  const info = document.getElementById('insertFileInfo');
  info.textContent = '✅ ' + f.name + ' (' + fmt(f.size) + ')';
  info.style.display = 'block';
}

function editClear() {
  editFile = null; editFilePages = 0; insertFile2 = null;
  previewPageUrls.forEach(u => u && URL.revokeObjectURL(u));
  previewPageUrls = [];
  previewSelectedPages.clear();
  document.getElementById('editWorkArea').style.display = 'none';
  document.getElementById('editPageInput').value = '';
  document.getElementById('insertPagesInput').value = '';
  document.getElementById('insertPosInput').value = '';
  document.getElementById('insertFileInfo').style.display = 'none';
  document.getElementById('previewBtn').style.display = 'none';
}

let rotateAngle = 90;
function setOp(op) {
  editOp = op;
  ['delete','keep','insert','rotate'].forEach(o => {
    const el = document.getElementById('op'+o.charAt(0).toUpperCase()+o.slice(1));
    if (el) el.classList.toggle('active', o === op);
  });
  document.getElementById('editPageInputSection').style.display = op !== 'insert' ? 'block' : 'none';
  document.getElementById('editInsertSection').style.display    = op === 'insert' ? 'block' : 'none';
  document.getElementById('rotateSection').style.display        = op === 'rotate' ? 'block' : 'none';
  if (op === 'delete') {
    document.getElementById('editPageLabel').textContent = 'Halaman yang akan dihapus';
    document.getElementById('editPageHint').textContent  = 'Gunakan koma dan tanda hubung. Contoh: 1, 3, 5-7. Halaman dihitung dari 1.';
    document.getElementById('editPageInput').placeholder = 'Contoh: 1, 3, 5-7, 10';
  } else if (op === 'keep') {
    document.getElementById('editPageLabel').textContent = 'Halaman yang ingin dipertahankan';
    document.getElementById('editPageHint').textContent  = 'Hanya halaman ini yang akan ada di hasil. Contoh: 2, 4-8.';
    document.getElementById('editPageInput').placeholder = 'Contoh: 2, 4-8, 10';
  } else if (op === 'rotate') {
    document.getElementById('editPageLabel').textContent = 'Halaman yang akan dirotasi (kosongkan = semua)';
    document.getElementById('editPageHint').textContent  = 'Kosongkan untuk merotasi SEMUA halaman. Atau tulis nomor halaman tertentu.';
    document.getElementById('editPageInput').placeholder = 'Kosongkan = semua halaman. Contoh: 1, 3, 5-7';
  }
}
function setRotate(angle, btn) {
  rotateAngle = angle;
  btn.closest('.rotate-angle-row').querySelectorAll('.rotate-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function parsePageRanges(str, totalPages) {
  const indices = new Set();
  str.split(',').forEach(part => {
    part = part.trim();
    const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (match) {
      let a = parseInt(match[1]), b = parseInt(match[2]);
      if (a > b) [a,b] = [b,a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= totalPages) indices.add(i - 1);
    } else {
      const n = parseInt(part);
      if (!isNaN(n) && n >= 1 && n <= totalPages) indices.add(n - 1);
    }
  });
  return indices;
}

async function processEdit() {
  if (!editFile) { toast('Pilih file PDF terlebih dahulu.'); return; }
  const { PDFDocument } = PDFLib;

  try {
    const buf = await editFile.arrayBuffer();
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
    const total = doc.getPageCount();
    let resultDoc;
    let resultName;

    if (editOp === 'delete') {
      const raw = document.getElementById('editPageInput').value.trim();
      if (!raw) { toast('Masukkan nomor halaman yang ingin dihapus.'); return; }
      const toDelete = parsePageRanges(raw, total);
      if (!toDelete.size) { toast('Tidak ada halaman valid yang dipilih.'); return; }
      if (toDelete.size >= total) { toast('Tidak bisa menghapus semua halaman.'); return; }
      resultDoc = await PDFDocument.create();
      const keepIndices = doc.getPageIndices().filter(i => !toDelete.has(i));
      const copied = await resultDoc.copyPages(doc, keepIndices);
      copied.forEach(p => resultDoc.addPage(p));
      resultName = editFile.name.replace(/\.pdf$/i, '') + '_edited.pdf';

    } else if (editOp === 'keep') {
      const raw = document.getElementById('editPageInput').value.trim();
      if (!raw) { toast('Masukkan nomor halaman yang ingin dipertahankan.'); return; }
      const toKeep = parsePageRanges(raw, total);
      if (!toKeep.size) { toast('Tidak ada halaman valid yang dipilih.'); return; }
      resultDoc = await PDFDocument.create();
      const sortedIndices = [...toKeep].sort((a,b) => a-b);
      const copied = await resultDoc.copyPages(doc, sortedIndices);
      copied.forEach(p => resultDoc.addPage(p));
      resultName = editFile.name.replace(/\.pdf$/i, '') + '_selected.pdf';

    } else if (editOp === 'insert') {
      if (!insertFile2) { toast('Pilih file PDF kedua yang akan disisipkan.'); return; }
      const pos = parseInt(document.getElementById('insertPosInput').value.trim());
      if (isNaN(pos) || pos < 0 || pos > total) { toast(`Posisi sisip harus antara 0 dan ${total}.`); return; }

      const buf2 = await insertFile2.arrayBuffer();
      const doc2 = await PDFDocument.load(buf2, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
      const total2 = doc2.getPageCount();

      const rawPages = document.getElementById('insertPagesInput').value.trim();
      let insertIndices;
      if (!rawPages) {
        insertIndices = doc2.getPageIndices();
      } else {
        const s = parsePageRanges(rawPages, total2);
        insertIndices = [...s].sort((a,b) => a-b);
      }
      if (!insertIndices.length) { toast('Tidak ada halaman valid dari PDF kedua.'); return; }

      resultDoc = await PDFDocument.create();
      const allOrig   = await resultDoc.copyPages(doc, doc.getPageIndices());
      const allInsert = await resultDoc.copyPages(doc2, insertIndices);

      allOrig.slice(0, pos).forEach(p => resultDoc.addPage(p));
      allInsert.forEach(p => resultDoc.addPage(p));
      allOrig.slice(pos).forEach(p => resultDoc.addPage(p));
      resultName = editFile.name.replace(/\.pdf$/i, '') + '_inserted.pdf';

    } else if (editOp === 'rotate') {
      const { degrees } = PDFLib;
      const raw    = document.getElementById('editPageInput').value.trim();
      const idxSet = raw ? parsePageRanges(raw, total) : new Set(Array.from({length:total},(_,i)=>i));
      idxSet.forEach(idx => {
        const pg  = doc.getPage(idx);
        const cur = pg.getRotation().angle;
        pg.setRotation(degrees((cur + rotateAngle) % 360));
      });
      const out2 = await doc.save({ useObjectStreams: true });
      dlBlob(out2, editFile.name.replace(/\.pdf$/i,'') + '_rotated.pdf');
      toast(`${idxSet.size} halaman berhasil dirotasi ${rotateAngle}°!`);
      return;
    }

    const out  = await resultDoc.save({ useObjectStreams: true });
    const blob = new Blob([out], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = resultName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('PDF berhasil diproses & diunduh!');
  } catch(e) {
    console.error(e);
    toast('Gagal memproses: ' + (e.message ? e.message.substring(0,80) : 'Error tidak diketahui'));
  }
}

// ─── HELPER ───
function dlBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ===================== SPLIT PDF =====================
let splitFile = null;
let splitFilePages = 0;
let splitMode = 'all';
let splitGroups = []; // [{label, indices}]

const splitDz = document.getElementById('splitDropzone');
splitDz.addEventListener('dragover', e => { e.preventDefault(); splitDz.classList.add('dragover'); });
splitDz.addEventListener('dragleave', () => splitDz.classList.remove('dragover'));
splitDz.addEventListener('drop', e => {
  e.preventDefault(); splitDz.classList.remove('dragover');
  const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.pdf'));
  if (f) splitLoadFile(f);
});
document.getElementById('splitFileInput').addEventListener('change', e => {
  if (e.target.files[0]) splitLoadFile(e.target.files[0]);
  e.target.value = '';
});

function splitLoadFile(f) {
  splitFile = f;
  document.getElementById('splitFileName').textContent = f.name;
  document.getElementById('splitFileMeta').textContent = fmt(f.size) + ' · Membaca halaman...';
  document.getElementById('splitWorkArea').style.display = 'block';
  document.getElementById('splitResultArea').style.display = 'none';
  f.arrayBuffer().then(buf =>
    PDFLib.PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false })
      .then(doc => {
        splitFilePages = doc.getPageCount();
        document.getElementById('splitFileMeta').textContent = fmt(f.size) + ' · ' + splitFilePages + ' halaman';
      }).catch(() => {})
  ).catch(() => {});
}

function splitClear() {
  splitFile = null; splitFilePages = 0; splitGroups = [];
  document.getElementById('splitWorkArea').style.display = 'none';
  document.getElementById('splitResultArea').style.display = 'none';
  document.getElementById('splitPoints').value = '';
}

function setSplitMode(m) {
  splitMode = m;
  document.getElementById('splitModeAll').classList.toggle('active', m === 'all');
  document.getElementById('splitModeCustom').classList.toggle('active', m === 'custom');
  document.getElementById('splitCustomSection').style.display = m === 'custom' ? 'block' : 'none';
}

function previewSplit() {
  if (!splitFile || !splitFilePages) { toast('Upload file PDF terlebih dahulu.'); return; }
  const baseName = splitFile.name.replace(/\.pdf$/i, '');

  if (splitMode === 'all') {
    // Each page is a group
    splitGroups = Array.from({length: splitFilePages}, (_, i) => ({
      label: 'Hal. ' + (i+1),
      indices: [i],
      defaultName: baseName + '_hal' + (i+1)
    }));
  } else {
    // Custom split points
    const raw = document.getElementById('splitPoints').value.trim();
    if (!raw) { toast('Masukkan titik pisah terlebih dahulu.'); return; }
    const points = raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n < splitFilePages).sort((a,b)=>a-b);
    // Remove duplicates
    const uniquePoints = [...new Set(points)];
    // Build groups: [0..p1-1], [p1..p2-1], ...
    const boundaries = [0, ...uniquePoints, splitFilePages];
    splitGroups = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end   = boundaries[i+1] - 1;
      const indices = Array.from({length: end - start + 1}, (_, j) => start + j);
      const startPage = start + 1;
      const endPage   = end + 1;
      splitGroups.push({
        label: startPage === endPage ? 'Hal. ' + startPage : 'Hal. ' + startPage + '-' + endPage,
        indices,
        defaultName: baseName + '_hal' + startPage + (startPage !== endPage ? '-' + endPage : '')
      });
    }
  }

  if (!splitGroups.length) { toast('Tidak ada bagian yang valid.'); return; }

  // Render result list
  document.getElementById('splitResultInfoText').textContent =
    splitGroups.length + ' file hasil split. Edit nama file di bawah (tanpa .pdf), lalu unduh.';
  const list = document.getElementById('splitResultList');
  list.innerHTML = splitGroups.map((g, i) => `
    <div class="split-result-item">
      <div class="split-num">${i+1}</div>
      <div class="split-pages-label">${g.label}</div>
      <input class="split-name-input" type="text" id="sname-${i}" value="${esc(g.defaultName)}" placeholder="Nama file...">
      <span class="ocr-status-dot" id="ocr-status-${i}" title=""></span>
    </div>`).join('');

  document.getElementById('splitResultArea').style.display = 'block';
  document.getElementById('splitResultArea').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Show OCR rename bar if OCR toggle is on
  const ocrOn = document.getElementById('ocrToggle') && document.getElementById('ocrToggle').checked;
  document.getElementById('ocrRenameBar').style.display = ocrOn ? 'flex' : 'none';
  document.getElementById('ocrResultHint').textContent = '';
  if (ocrOn) {
    setTimeout(() => runOCRRename(), 200);
  }
}

async function buildSplitZipBlob() {
  const { PDFDocument } = PDFLib;
  const buf = await splitFile.arrayBuffer();
  const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });

  const zipParts = [], centralDir = [];
  let offset = 0;

  for (let i = 0; i < splitGroups.length; i++) {
    const g = splitGroups[i];
    const nameVal = (document.getElementById('sname-'+i)?.value.trim() || g.defaultName) + '.pdf';
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, g.indices);
    copied.forEach(p => singleDoc.addPage(p));
    const fileBytes = new Uint8Array(await singleDoc.save({ useObjectStreams: true }));
    const nameBytes = new TextEncoder().encode(nameVal);
    const lh = buildLocalHeader(nameBytes, fileBytes);
    centralDir.push({ nameBytes, fileBytes, offset, localHeader: lh });
    offset += lh.length + fileBytes.length;
    zipParts.push(lh, fileBytes);
  }

  const cdParts = []; let cdSize = 0; const cdOffset = offset;
  for (const e of centralDir) { const cd = buildCentralDir(e.nameBytes, e.fileBytes, e.offset); cdParts.push(cd); cdSize += cd.length; }
  const eocd = buildEOCD(centralDir.length, cdSize, cdOffset);
  const allParts = [...zipParts, ...cdParts, eocd];
  const total = allParts.reduce((s,p) => s+p.length, 0);
  const out = new Uint8Array(total); let pos = 0;
  for (const p of allParts) { out.set(p, pos); pos += p.length; }
  return out;
}

async function downloadSplitZip() {
  if (!splitGroups.length) return;
  const btn = document.querySelector('#splitResultArea .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }
  try {
    const zipBytes = await buildSplitZipBlob();
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = splitFile.name.replace(/\.pdf$/i,'') + '_split.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(splitGroups.length + ' file berhasil diunduh dalam ZIP!');
  } catch(e) { console.error(e); toast('Gagal membuat ZIP: ' + (e.message||'')); }
  if (btn) { btn.disabled = false; btn.textContent = 'Unduh Semua (ZIP)'; }
}

async function downloadSplitIndividual() {
  if (!splitGroups.length) return;
  const { PDFDocument } = PDFLib;
  const buf = await splitFile.arrayBuffer();
  const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
  for (let i = 0; i < splitGroups.length; i++) {
    const g = splitGroups[i];
    const nameVal = (document.getElementById('sname-'+i)?.value.trim() || g.defaultName) + '.pdf';
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, g.indices);
    copied.forEach(p => singleDoc.addPage(p));
    const bytes = await singleDoc.save({ useObjectStreams: true });
    dlBlob(bytes, nameVal);
    await new Promise(r => setTimeout(r, 400));
  }
  toast(splitGroups.length + ' file diunduh satu per satu!');
}

// ===================== BATCH COMBINE =====================
let batchHeaderFile = null;
let batchFooterFile = null;
let batchFiles = [];
let batchIdCtr = 0;
let batchMode  = 'both';
let batchDragId = null;

// Header/Footer drops
function setupHFDrop(id, inputId, which) {
  const dz = document.getElementById(id);
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.pdf'));
    if (f) setHFFile(which, f);
  });
  document.getElementById(inputId).addEventListener('change', e => {
    if (e.target.files[0]) setHFFile(which, e.target.files[0]);
    e.target.value = '';
  });
}
setupHFDrop('batchHeaderDrop', 'batchHeaderInput', 'header');
setupHFDrop('batchFooterDrop', 'batchFooterInput', 'footer');

function setHFFile(which, f) {
  if (which === 'header') {
    batchHeaderFile = f;
    document.getElementById('batchHeaderName').textContent = '✅ ' + f.name;
    document.getElementById('batchHeaderName').style.display = 'block';
    document.getElementById('batchHeaderDrop').classList.add('has-file');
    document.getElementById('batchHeaderClearBtn').style.display = 'block';
  } else {
    batchFooterFile = f;
    document.getElementById('batchFooterName').textContent = '✅ ' + f.name;
    document.getElementById('batchFooterName').style.display = 'block';
    document.getElementById('batchFooterDrop').classList.add('has-file');
    document.getElementById('batchFooterClearBtn').style.display = 'block';
  }
}
function batchClearHF(which) {
  if (which === 'header') {
    batchHeaderFile = null;
    document.getElementById('batchHeaderName').style.display = 'none';
    document.getElementById('batchHeaderDrop').classList.remove('has-file');
    document.getElementById('batchHeaderClearBtn').style.display = 'none';
  } else {
    batchFooterFile = null;
    document.getElementById('batchFooterName').style.display = 'none';
    document.getElementById('batchFooterDrop').classList.remove('has-file');
    document.getElementById('batchFooterClearBtn').style.display = 'none';
  }
}

function setBatchMode(m) {
  batchMode = m;
  document.getElementById('batchModeHF').classList.toggle('active', m === 'both');
  document.getElementById('batchModeH').classList.toggle('active',  m === 'header');
  document.getElementById('batchModeF').classList.toggle('active',  m === 'footer');
}

const batchDz = document.getElementById('batchDropzone');
batchDz.addEventListener('dragover', e => { e.preventDefault(); batchDz.classList.add('dragover'); });
batchDz.addEventListener('dragleave', () => batchDz.classList.remove('dragover'));
batchDz.addEventListener('drop', e => {
  e.preventDefault(); batchDz.classList.remove('dragover');
  batchAddFiles([...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf')));
});
document.getElementById('batchFileInput').addEventListener('change', e => {
  batchAddFiles([...e.target.files]);
  e.target.value = '';
});

function batchAddFiles(arr) {
  arr.forEach(f => {
    const entry = { id: ++batchIdCtr, file: f, name: f.name, size: f.size, pages: null };
    batchFiles.push(entry);
    f.arrayBuffer().then(buf =>
      PDFLib.PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false })
        .then(doc => { entry.pages = doc.getPageCount(); batchRenderList(); })
        .catch(() => {})
    ).catch(() => {});
  });
  batchRenderList();
}

function batchClearFiles() { batchFiles = []; document.getElementById('batchResultBox').classList.remove('show'); batchRenderList(); }
function batchRemoveFile(id) { batchFiles = batchFiles.filter(f => f.id !== id); batchRenderList(); }

function batchRenderList() {
  const wa = document.getElementById('batchWorkArea');
  if (!batchFiles.length) { wa.style.display = 'none'; return; }
  wa.style.display = 'block';
  document.getElementById('batchFileCount').textContent = batchFiles.length + ' file base dipilih';
  const list = document.getElementById('batchList');
  list.innerHTML = batchFiles.map((f,i) => `
    <div class="merge-card" id="bc-${f.id}" draggable="true"
         ondragstart="batchDragStart(${f.id})"
         ondragover="batchDragOver(event,${f.id})"
         ondragleave="batchDragLeave(${f.id})"
         ondrop="batchDrop(event,${f.id})"
         ondragend="batchDragEnd()">
      <span class="drag-handle">⠿</span>
      <span class="merge-num">${i+1}</span>
      <div class="file-icon" style="width:30px;height:30px;font-size:10px;border-radius:6px">PDF</div>
      <div class="file-info">
        <div class="file-name">${esc(f.name)}</div>
        <div class="file-meta">${fmt(f.size)}${f.pages ? ' · '+f.pages+' hal.' : ''}</div>
      </div>
      <button class="btn-rm" onclick="batchRemoveFile(${f.id})">✕</button>
    </div>`).join('');
}

function batchDragStart(id) { batchDragId = id; document.getElementById('bc-'+id).classList.add('dragging'); }
function batchDragOver(e, id) { e.preventDefault(); if (id !== batchDragId) document.getElementById('bc-'+id).classList.add('drag-over'); }
function batchDragLeave(id) { document.getElementById('bc-'+id).classList.remove('drag-over'); }
function batchDragEnd() { batchFiles.forEach(f => { const el=document.getElementById('bc-'+f.id); if(el){el.classList.remove('dragging');el.classList.remove('drag-over');}}); batchDragId=null; }
function batchDrop(e, targetId) {
  e.preventDefault();
  if (!batchDragId || batchDragId === targetId) return;
  const fi = batchFiles.findIndex(f => f.id === batchDragId);
  const ti = batchFiles.findIndex(f => f.id === targetId);
  const [item] = batchFiles.splice(fi, 1);
  batchFiles.splice(ti, 0, item);
  batchRenderList();
}

async function runBatchCombine() {
  if (!batchFiles.length) { toast('Upload file PDF terlebih dahulu.'); return; }
  const needHeader = batchMode === 'both' || batchMode === 'header';
  const needFooter = batchMode === 'both' || batchMode === 'footer';
  if (needHeader && !batchHeaderFile) { toast('Pilih PDF Awal (Header) terlebih dahulu.'); return; }
  if (needFooter && !batchFooterFile) { toast('Pilih PDF Akhir (Footer) terlebih dahulu.'); return; }

  const btn = document.getElementById('batchRunBtn');
  btn.disabled = true; btn.textContent = '⏳ Memproses...';

  try {
    const { PDFDocument } = PDFLib;
    let headerDoc = null, footerDoc = null;
    if (needHeader) { const buf = await batchHeaderFile.arrayBuffer(); headerDoc = await PDFDocument.load(buf, { ignoreEncryption:true, throwOnInvalidObject:false, updateMetadata:false }); }
    if (needFooter) { const buf = await batchFooterFile.arrayBuffer(); footerDoc = await PDFDocument.load(buf, { ignoreEncryption:true, throwOnInvalidObject:false, updateMetadata:false }); }

    const zipParts = [], centralDir = [];
    let offset = 0;

    for (const f of batchFiles) {
      const buf = await f.file.arrayBuffer();
      const baseDoc = await PDFDocument.load(buf, { ignoreEncryption:true, throwOnInvalidObject:false, updateMetadata:false });
      const merged  = await PDFDocument.create();

      if (needHeader && headerDoc) {
        const pages = await merged.copyPages(headerDoc, headerDoc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const basePages = await merged.copyPages(baseDoc, baseDoc.getPageIndices());
      basePages.forEach(p => merged.addPage(p));
      if (needFooter && footerDoc) {
        const pages = await merged.copyPages(footerDoc, footerDoc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }

      const fileBytes = new Uint8Array(await merged.save({ useObjectStreams: true }));
      const addSfx    = document.getElementById('batchAddSuffix').checked;
      const sfxStr    = addSfx ? (batchMode === 'both' ? '_combined' : batchMode === 'header' ? '_with-header' : '_with-footer') : '';
      const fileName  = f.name.replace(/\.pdf$/i, '') + sfxStr + '.pdf';
      const nameBytes = new TextEncoder().encode(fileName);
      const lh = buildLocalHeader(nameBytes, fileBytes);
      centralDir.push({ nameBytes, fileBytes, offset, localHeader: lh });
      offset += lh.length + fileBytes.length;
      zipParts.push(lh, fileBytes);
    }

    const cdParts = []; let cdSize = 0; const cdOffset = offset;
    for (const e of centralDir) { const cd = buildCentralDir(e.nameBytes, e.fileBytes, e.offset); cdParts.push(cd); cdSize += cd.length; }
    const eocd = buildEOCD(centralDir.length, cdSize, cdOffset);
    const allParts = [...zipParts, ...cdParts, eocd];
    const totalSz = allParts.reduce((s,p)=>s+p.length,0);
    const out = new Uint8Array(totalSz); let pos = 0;
    for (const p of allParts) { out.set(p, pos); pos += p.length; }

    const blob = new Blob([out], { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'batch_combined.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    document.getElementById('batchResultText').textContent =
      batchFiles.length + ' file berhasil diproses dengan ' +
      (needHeader ? 'header' : '') + (needHeader && needFooter ? ' + ' : '') + (needFooter ? 'footer' : '') + '!';
    document.getElementById('batchResultBox').classList.add('show');
    toast(batchFiles.length + ' file selesai diproses!');
  } catch(e) {
    console.error(e);
    toast('Gagal: ' + (e.message||'Error tidak diketahui'));
  }
  btn.disabled = false; btn.textContent = 'Proses & Unduh ZIP';
}

async function runBatchCombineIndividual() {
  if (!batchFiles.length) { toast('Upload file PDF terlebih dahulu.'); return; }
  const needHeader = batchMode === 'both' || batchMode === 'header';
  const needFooter = batchMode === 'both' || batchMode === 'footer';
  if (needHeader && !batchHeaderFile) { toast('Pilih PDF Awal (Header) terlebih dahulu.'); return; }
  if (needFooter && !batchFooterFile) { toast('Pilih PDF Akhir (Footer) terlebih dahulu.'); return; }

  const btn = document.getElementById('batchRunIndividualBtn');
  btn.disabled = true; btn.textContent = '⏳ Memproses...';

  try {
    const { PDFDocument } = PDFLib;
    let headerDoc = null, footerDoc = null;
    if (needHeader) { const buf = await batchHeaderFile.arrayBuffer(); headerDoc = await PDFDocument.load(buf, { ignoreEncryption:true, throwOnInvalidObject:false, updateMetadata:false }); }
    if (needFooter) { const buf = await batchFooterFile.arrayBuffer(); footerDoc = await PDFDocument.load(buf, { ignoreEncryption:true, throwOnInvalidObject:false, updateMetadata:false }); }

    const addSfx = document.getElementById('batchAddSuffix').checked;
    const sfxStr = addSfx ? (batchMode === 'both' ? '_combined' : batchMode === 'header' ? '_with-header' : '_with-footer') : '';

    for (let i = 0; i < batchFiles.length; i++) {
      const f = batchFiles[i];
      btn.textContent = `⏳ ${i+1}/${batchFiles.length}...`;
      const buf = await f.file.arrayBuffer();
      const baseDoc = await PDFDocument.load(buf, { ignoreEncryption:true, throwOnInvalidObject:false, updateMetadata:false });
      const merged  = await PDFDocument.create();
      if (needHeader && headerDoc) { const pages = await merged.copyPages(headerDoc, headerDoc.getPageIndices()); pages.forEach(p => merged.addPage(p)); }
      const basePages = await merged.copyPages(baseDoc, baseDoc.getPageIndices()); basePages.forEach(p => merged.addPage(p));
      if (needFooter && footerDoc) { const pages = await merged.copyPages(footerDoc, footerDoc.getPageIndices()); pages.forEach(p => merged.addPage(p)); }
      const fileBytes = new Uint8Array(await merged.save({ useObjectStreams: true }));
      const fileName  = f.name.replace(/\.pdf$/i, '') + sfxStr + '.pdf';
      const blob = new Blob([fileBytes], { type:'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      await new Promise(r => setTimeout(r, 300));
    }

    document.getElementById('batchResultText').textContent = batchFiles.length + ' file berhasil diunduh satu per satu!';
    document.getElementById('batchResultBox').classList.add('show');
    toast(batchFiles.length + ' file selesai diproses!');
  } catch(e) {
    console.error(e);
    toast('Gagal: ' + (e.message||'Error tidak diketahui'));
  }
  btn.disabled = false; btn.textContent = 'Proses & Unduh Satu Per Satu';
}

// ===================== OCR AUTO RENAME (SPLIT PDF) =====================

function toggleOCRConfig(on) {
  document.getElementById('ocrConfig').style.display = on ? 'block' : 'none';
}

let _ocrLibsReady = false;
let _ocrWorker    = null;

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Gagal memuat: ' + src));
    document.head.appendChild(s);
  });
}

async function _ensureOCRLibs(onStatus) {
  if (_ocrLibsReady) return;

  onStatus('Mengunduh PDF.js renderer...');
  await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  window.pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  onStatus('Mengunduh Tesseract OCR engine...');
  await _loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

  onStatus('Menginisialisasi OCR (unduh data bahasa ~4MB)...');
  _ocrWorker = await window.Tesseract.createWorker('eng', 1, { logger: () => {} });

  _ocrLibsReady = true;
  onStatus('Siap');
}

async function runOCRRename() {
  if (!splitGroups || !splitGroups.length) { toast('Belum ada hasil split.'); return; }
  if (!splitFile) { toast('File PDF belum diupload.'); return; }

  const keyword  = (document.getElementById('ocrKeyword')?.value || 'Sample Identification').trim();
  const btn      = document.getElementById('ocrRenameBtn');
  const progEl   = document.getElementById('ocrProgress');
  const progText = document.getElementById('ocrProgressText');
  const hintEl   = document.getElementById('ocrResultHint');

  const setStatus   = msg  => { if (progText) progText.textContent = msg; };
  const setProgress = show => { if (progEl)   progEl.style.display = show ? 'flex' : 'none'; };
  const setDot      = (i, cls, title) => {
    const dot = document.getElementById('ocr-status-' + i);
    if (dot) { dot.className = 'ocr-status-dot ' + cls; dot.title = title; }
  };

  if (btn) btn.disabled = true;
  if (hintEl) hintEl.textContent = '';
  setProgress(true);

  // Mark all dots as "waiting / spinning"
  for (let j = 0; j < splitGroups.length; j++) setDot(j, 'ocr-spin', 'Menunggu OCR...');

  try {
    await _ensureOCRLibs(setStatus);

    const { PDFDocument } = PDFLib;
    const buf    = await splitFile.arrayBuffer();
    const srcDoc = await PDFDocument.load(new Uint8Array(buf), {
      ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false
    });

    let found = 0, notFound = 0, errCount = 0;

    for (let i = 0; i < splitGroups.length; i++) {
      setStatus(`OCR ${i + 1} / ${splitGroups.length}...`);

      try {
        // Build single-part PDF
        const partDoc = await PDFDocument.create();
        const copied  = await partDoc.copyPages(srcDoc, splitGroups[i].indices);
        copied.forEach(p => partDoc.addPage(p));
        const pdfBytes = await partDoc.save({ useObjectStreams: false });

        // Render first page to canvas at 2× scale (~145 DPI) — better OCR accuracy
        const loadTask = window.pdfjsLib.getDocument({ data: pdfBytes.buffer.slice(0) });
        const pdfDoc   = await loadTask.promise;
        const page     = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        // OCR
        const { data: { text } } = await _ocrWorker.recognize(canvas);

        // Extract value — improved: handle ":", ";", and value on next line
        let extracted = null;
        const kw    = keyword.toLowerCase();
        const lines = text.split('\n');
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          if (!line.toLowerCase().includes(kw)) continue;

          // Find separator — OCR sometimes misreads ":" as ";" or "."
          const sepMatch = line.match(/[;:]/);
          if (sepMatch) {
            const ci = line.indexOf(sepMatch[0]);
            let val  = line.substring(ci + 1).trim();
            // If value part is empty or too short, try next line
            if (val.length < 2 && li + 1 < lines.length) {
              val = lines[li + 1].trim();
            }
            val = val.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/^[\s.]+|[\s.]+$/g, '');
            if (val.length > 0 && val.length <= 150) { extracted = val; break; }
          } else {
            // No separator on same line — value might be on next line
            if (li + 1 < lines.length) {
              let val = lines[li + 1].trim();
              val = val.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/^[\s.]+|[\s.]+$/g, '');
              if (val.length > 0 && val.length <= 150) { extracted = val; break; }
            }
          }
        }

        const input = document.getElementById('sname-' + i);
        if (extracted) {
          if (input) input.value = extracted;
          found++;
          setDot(i, 'ocr-ok', 'Ditemukan: ' + extracted);
        } else {
          notFound++;
          setDot(i, 'ocr-fail', 'Kata kunci "' + keyword + '" tidak ditemukan di halaman ini');
        }

      } catch (pageErr) {
        console.warn('OCR error on group', i, pageErr);
        errCount++;
        setDot(i, 'ocr-warn', 'Error render/OCR: ' + (pageErr.message || ''));
      }
    }

    setProgress(false);
    const parts = [];
    if (found)    parts.push(found + ' berhasil');
    if (notFound) parts.push(notFound + ' tidak ditemukan');
    if (errCount) parts.push(errCount + ' error');
    const msg = 'OCR selesai: ' + parts.join(', ') + '. Arahkan kursor ke titik berwarna untuk detail.';
    if (hintEl) hintEl.textContent = msg;
    toast('OCR selesai: ' + found + ' nama terisi.');

  } catch (e) {
    console.error('OCR failed:', e);
    setProgress(false);
    for (let j = 0; j < splitGroups.length; j++) setDot(j, 'ocr-warn', 'Proses dibatalkan');
    const errMsg = e.message || 'Periksa koneksi internet lalu coba lagi.';
    if (hintEl) hintEl.textContent = 'Gagal memuat library: ' + errMsg;
    toast('OCR gagal: ' + errMsg);
  }

  if (btn) btn.disabled = false;
}
// ============================================================ NAVIGATION
const pages = ['pdf-tools','rename','organize'];
function showTool(id) {
  ['hub','pdf-tools','rename','organize'].forEach(p => {
    const el = document.getElementById('page-'+p);
    if (el) el.classList.remove('active');
  });
  document.getElementById('page-'+id).classList.add('active');
  document.getElementById('gBack').classList.add('show');
  const labels = {'pdf-tools':'PDF Tools', rename:'Batch File Rename', organize:'File Organizer'};
  document.getElementById('gToolLabel').textContent = labels[id] || '';
  document.getElementById('gToolLabel').classList.add('show');
  window.scrollTo(0,0);
}
function backToHub() {
  ['hub','pdf-tools','rename','organize'].forEach(p => {
    const el = document.getElementById('page-'+p);
    if (el) el.classList.remove('active');
  });
  document.getElementById('page-hub').classList.add('active');
  document.getElementById('gBack').classList.remove('show');
  document.getElementById('gToolLabel').classList.remove('show');
  window.scrollTo(0,0);
}

// Override toggleTheme from PDF Tools (remove emoji)
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeBtn').textContent = dark ? 'Gelap' : 'Terang';
}

// Override openWelcome / closeWelcome — suppress auto-show
function openWelcome() {}
function closeWelcome() {
  const el = document.getElementById('welcomeOverlay');
  if (el) { el.classList.remove('show'); }
}

// closeModal helper
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

// toggleGuide
function toggleGuide() {
  const b = document.getElementById('guideBody');
  const i = document.getElementById('guideIcon');
  b.classList.toggle('open');
  i.style.transform = b.classList.contains('open') ? 'rotate(180deg)' : '';
}

// esc alias for rename/organizer (PDF Tools defines esc(), we need escHtml())
function escHtml(s) { return esc(s); }

// dlText — independent of dlBlob (PDF Tools dlBlob takes bytes not Blob)
function dlText(text, filename, mime) {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// getExt
function getExt(filename) { const i = filename.lastIndexOf('.'); return i >= 0 ? filename.slice(i) : ''; }

// ============================================================ BATCH RENAME
let rn_dirHandle = null, rn_allFiles = [], rn_filteredFiles = [], rn_plan = [], rn_previewTimer = null;

function rnResetAll() {
  rn_dirHandle = null; rn_allFiles = []; rn_filteredFiles = []; rn_plan = [];
  clearTimeout(rn_previewTimer);
  const ids = ['rn-folderInfo','rn-previewCard','rn-logCard'];
  ids.forEach(id => { const el = document.getElementById(id); if(el) el.style.display='none'; });
  const clears = { 'rn-newNamesInput':'', 'rn-extFilter':'', 'rn-prefixInput':'', 'rn-suffixInput':'' };
  Object.entries(clears).forEach(([id,v]) => { const el=document.getElementById(id); if(el) el.value=v; });
}

async function rnPickFolder() {
  try {
    rn_dirHandle = await window.showDirectoryPicker({ mode:'readwrite' });
    await rnLoadFiles();
  } catch(e) { if (e.name !== 'AbortError') alert('Gagal membuka folder: ' + e.message); }
}
async function rnLoadFiles(doPreview = true) {
  rn_allFiles = [];
  for await (const [name, handle] of rn_dirHandle.entries()) {
    if (handle.kind === 'file') rn_allFiles.push({ name, handle });
  }
  rnApplyExtFilter();
  document.getElementById('rn-folderInfo').style.display = 'block';
  document.getElementById('rn-folderInfoText').textContent = 'Folder: ' + rn_dirHandle.name + '  —  ' + rn_allFiles.length + ' file ditemukan';
  if (doPreview) rnRenderPreview();
}
function rnApplyExtFilter() {
  const raw = document.getElementById('rn-extFilter').value.trim().toLowerCase();
  if (!raw) { rn_filteredFiles = [...rn_allFiles]; return; }
  const exts = raw.split(/\s+/).map(e => e.startsWith('.') ? e : '.'+e);
  rn_filteredFiles = rn_allFiles.filter(f => exts.some(e => f.name.toLowerCase().endsWith(e)));
}
function rnApplyFilter() { rnApplyExtFilter(); rnSortFiles(); if (rn_filteredFiles.length) rnRenderPreview(); }
function rnSortFiles() {
  const mode = document.getElementById('rn-sortMode').value;
  rn_filteredFiles.sort((a,b) => mode === 'name' ? a.name.localeCompare(b.name,undefined,{numeric:true}) : b.name.localeCompare(a.name,undefined,{numeric:true}));
}
async function rnImportFromClipboard() {
  try { const t = await navigator.clipboard.readText(); document.getElementById('rn-newNamesInput').value = t.trim(); rnSchedulePreview(); }
  catch(e) { alert('Tidak bisa akses clipboard. Coba paste manual ke kotak teks.'); }
}
function rnImportFromFile(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result.trim();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const firstLine = lines[0] || '';
    const isCSV = firstLine.includes(',') || firstLine.includes(';');
    if (isCSV) {
      const parseRow = line => {
        const cols = []; let cur = '', inQ = false;
        const sep = line.includes(';') ? ';' : ',';
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === sep && !inQ) { cols.push(cur); cur = ''; }
          else { cur += ch; }
        }
        cols.push(cur);
        return cols;
      };
      // Skip header row (index 0), extract column 4 (index 3)
      const names = lines.slice(1).map(line => {
        const cols = parseRow(line);
        return (cols[3] ?? '').replace(/^"|"$/g, '').trim();
      });
      document.getElementById('rn-newNamesInput').value = names.join('\n');
      toast('CSV diimpor: ' + names.length + ' nama dari kolom ke-4.');
    } else {
      document.getElementById('rn-newNamesInput').value = text;
    }
    rnSchedulePreview();
  };
  reader.readAsText(file, 'utf-8'); input.value = '';
}
function rnSchedulePreview() { clearTimeout(rn_previewTimer); rn_previewTimer = setTimeout(rnRenderPreview, 300); }
function rnRenderPreview() {
  if (!rn_filteredFiles.length) return;
  rnSortFiles();
  const rawNames = document.getElementById('rn-newNamesInput').value.split('\n').map(l => l.trim());
  const prefix = document.getElementById('rn-prefixInput').value;
  const suffix = document.getElementById('rn-suffixInput').value;
  const existingNames = new Set(rn_allFiles.map(f => f.name.toLowerCase()));
  rn_plan = rn_filteredFiles.map((f, i) => {
    const rawNew = rawNames[i] ?? '';
    if (!rawNew) return { orig:f.name, newFull:'', status:'skip', handle:f.handle };
    const ext = getExt(f.name);
    const baseName = prefix + rawNew + suffix;
    let newFull = baseName + ext;
    if (existingNames.has(newFull.toLowerCase()) && newFull.toLowerCase() !== f.name.toLowerCase()) {
      const mode = document.getElementById('rn-conflictMode').value;
      if (mode === 'skip') return { orig:f.name, newFull, status:'conflict', handle:f.handle };
      let n = 2;
      while (existingNames.has((baseName+'_'+n+ext).toLowerCase())) n++;
      newFull = baseName + '_' + n + ext;
    }
    const status = newFull.toLowerCase() === f.name.toLowerCase() ? 'same' : 'ok';
    return { orig:f.name, newFull, status, handle:f.handle };
  });
  let nOk=0, nSkip=0, nConflict=0, nSame=0;
  rn_plan.forEach(p => { if(p.status==='ok')nOk++; else if(p.status==='skip')nSkip++; else if(p.status==='conflict')nConflict++; else if(p.status==='same')nSame++; });
  document.getElementById('rn-summaryRow').innerHTML = `
    <div class="stat-item"><div class="n n-total">${rn_plan.length}</div><div class="lbl">Total File</div></div>
    <div class="stat-item"><div class="n n-ok">${nOk}</div><div class="lbl">Akan Direname</div></div>
    <div class="stat-item"><div class="n" style="color:var(--text3)">${nSame}</div><div class="lbl">Nama Sama</div></div>
    <div class="stat-item"><div class="n n-warn">${nSkip}</div><div class="lbl">Dilewati</div></div>
    <div class="stat-item"><div class="n n-err">${nConflict}</div><div class="lbl">Konflik</div></div>`;
  document.getElementById('rn-previewBody').innerHTML = rn_plan.map((p, i) => {
    let pill, cls = '';
    if (p.status==='ok') { pill='<span class="pill pill-ok">Rename</span>'; cls='new-name'; }
    else if (p.status==='skip') pill='<span class="pill pill-skip">Lewati</span>';
    else if (p.status==='conflict') { pill='<span class="pill pill-err">Konflik</span>'; cls='new-name'; }
    else pill='<span class="pill pill-skip">Sama</span>';
    return `<tr><td>${i+1}</td><td class="name-col">${escHtml(p.orig)}</td><td class="${cls}">${p.newFull ? escHtml(p.newFull) : '<span style="color:var(--text3);font-style:italic">dilewati</span>'}</td><td>${pill}</td></tr>`;
  }).join('');
  document.getElementById('rn-previewCard').style.display = 'block';
  document.getElementById('rn-execBtn').disabled = nOk === 0;
}
async function rnExecuteRename() {
  const toRename = rn_plan.filter(p => p.status === 'ok');
  if (!toRename.length) return;
  document.getElementById('rn-execBtn').disabled = true;
  document.getElementById('rn-progressWrap').style.display = 'block';
  document.getElementById('rn-logCard').style.display = 'block';
  const logEl = document.getElementById('rn-log');
  logEl.innerHTML = '';
  let done = 0, failed = 0;
  for (let i = 0; i < toRename.length; i++) {
    const p = toRename[i];
    try {
      const file = await p.handle.getFile();
      const bytes = await file.arrayBuffer();
      const newHandle = await rn_dirHandle.getFileHandle(p.newFull, { create:true });
      const writable = await newHandle.createWritable();
      await writable.write(bytes); await writable.close();
      if (p.orig.toLowerCase() !== p.newFull.toLowerCase()) await rn_dirHandle.removeEntry(p.orig);
      logEl.innerHTML += `<div class="log-ok">${escHtml(p.orig)} &rarr; ${escHtml(p.newFull)}</div>`;
      done++;
    } catch(e) {
      logEl.innerHTML += `<div class="log-err">${escHtml(p.orig)} &rarr; GAGAL: ${e.message}</div>`;
      failed++;
    }
    const pct = Math.round(((i+1)/toRename.length)*100);
    document.getElementById('rn-progressBar').style.width = pct + '%';
    document.getElementById('rn-progressText').textContent = (i+1) + '/' + toRename.length + ' file diproses';
    logEl.scrollTop = logEl.scrollHeight;
  }
  document.getElementById('rn-execStatus').textContent = 'Selesai: ' + done + ' berhasil, ' + failed + ' gagal';
  document.getElementById('rn-execBtn').disabled = false;
  await rnLoadFiles(false);
  document.getElementById('rn-newNamesInput').value = '';
  document.getElementById('rn-previewCard').style.display = 'none';
  logEl.innerHTML += `<div class="log-ok" style="margin-top:8px;font-weight:bold">Rename selesai. File di folder sudah diperbarui.</div>`;
  logEl.scrollTop = logEl.scrollHeight;
}
function rnExportCSV() {
  if (!rn_filteredFiles.length) { alert('Pilih folder dulu.'); return; }
  rnSortFiles();
  const rows = [['No','Nama Asli (tanpa ekstensi)','Ekstensi','Nama Baru (isi di sini)']];
  rn_filteredFiles.forEach((f,i) => { const ext=getExt(f.name); rows.push([i+1, f.name.slice(0,f.name.length-ext.length), ext, '']); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  dlText('﻿'+csv, 'daftar-file.csv', 'text/csv');
}
function rnExportTXT() {
  if (!rn_filteredFiles.length) { alert('Pilih folder dulu.'); return; }
  rnSortFiles();
  const lines = rn_filteredFiles.map(f => { const ext=getExt(f.name); return f.name.slice(0,f.name.length-ext.length); });
  dlText(lines.join('\r\n'), 'nama-file.txt', 'text/plain');
}
function rnCopyLog() { navigator.clipboard.writeText(document.getElementById('rn-log').innerText).then(() => toast('Log disalin!')); }

// ============================================================ FILE ORGANIZER
let org_dirHandle = null, org_allFiles = [], org_filteredFiles = [], org_rules = [], org_plan = [], org_ruleIdSeq = 0, org_previewTimer = null;

async function orgPickFolder() {
  try {
    org_dirHandle = await window.showDirectoryPicker({ mode:'readwrite' });
    await orgLoadFiles();
  } catch(e) { if (e.name !== 'AbortError') alert('Gagal: ' + e.message); }
}
async function orgLoadFiles() {
  org_allFiles = [];
  for await (const [name, handle] of org_dirHandle.entries()) {
    if (handle.kind === 'file') org_allFiles.push({ name, handle });
  }
  org_allFiles.sort((a,b) => a.name.localeCompare(b.name,undefined,{numeric:true}));
  orgApplyExtFilter();
  document.getElementById('org-folderInfo').style.display = 'block';
  document.getElementById('org-folderInfoText').textContent = 'Folder: ' + org_dirHandle.name + '  —  ' + org_allFiles.length + ' file ditemukan';
  document.getElementById('org-previewBtn').disabled = false;
  orgSchedulePreview();
}
function orgApplyExtFilter() {
  const raw = document.getElementById('org-extFilter').value.trim().toLowerCase();
  if (!raw) { org_filteredFiles = [...org_allFiles]; return; }
  const exts = raw.split(/\s+/).map(e => e.startsWith('.') ? e : '.'+e);
  org_filteredFiles = org_allFiles.filter(f => exts.some(e => f.name.toLowerCase().endsWith(e)));
}
function orgApplyFilter() { orgApplyExtFilter(); orgSchedulePreview(); }
function orgExportFileList() {
  if (!org_filteredFiles.length) { alert('Pilih folder dulu.'); return; }
  dlText(org_filteredFiles.map(f=>f.name).join('\r\n'), 'daftar-file.txt', 'text/plain');
}
function orgAddRule(pattern='', folder='', priority=org_rules.length+1) {
  const id = ++org_ruleIdSeq;
  org_rules.push({ id, pattern, folder, priority });
  orgRenderRulesTable(); orgSchedulePreview();
}
function orgRemoveRule(id) { org_rules = org_rules.filter(r => r.id !== id); orgRenderRulesTable(); orgSchedulePreview(); }
function orgGetRuleValues() {
  org_rules.forEach(r => {
    const pe = document.getElementById('org-pat-'+r.id), fe = document.getElementById('org-fol-'+r.id), pr = document.getElementById('org-pri-'+r.id);
    if (pe) r.pattern = pe.value.trim();
    if (fe) r.folder = fe.value.trim();
    if (pr) r.priority = parseInt(pr.value)||1;
  });
}
function orgRenderRulesTable() {
  const tbody = document.getElementById('org-rulesBody');
  document.getElementById('org-noRulesMsg').style.display = org_rules.length ? 'none' : 'block';
  tbody.innerHTML = org_rules.map(r => `<tr>
    <td><input type="text" id="org-pat-${r.id}" value="${escHtml(r.pattern)}" placeholder="Misal: TEK 3000 BKP" oninput="orgSchedulePreview()" style="width:100%"></td>
    <td><input type="text" id="org-fol-${r.id}" value="${escHtml(r.folder)}" placeholder="Nama folder tujuan" oninput="orgSchedulePreview()" style="width:100%"></td>
    <td><input type="number" id="org-pri-${r.id}" value="${r.priority}" min="1" max="999" style="width:55px" oninput="orgSchedulePreview()"></td>
    <td><button class="btn btn-danger btn-sm" onclick="orgRemoveRule(${r.id})">&times;</button></td>
  </tr>`).join('');
}
function orgClearAllRules() { if (org_rules.length && !confirm('Hapus semua rules?')) return; org_rules = []; orgRenderRulesTable(); orgSchedulePreview(); }
function orgResetAll() {
  org_dirHandle = null; org_allFiles = []; org_filteredFiles = []; org_plan = [];
  org_rules = []; org_ruleIdSeq = 0;
  clearTimeout(org_previewTimer);
  ['org-folderInfo','org-previewCard','org-logCard'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  const el = document.getElementById('org-extFilter'); if(el) el.value='';
  orgRenderRulesTable();
}
async function orgImportRulesClipboard() {
  try { const t = await navigator.clipboard.readText(); orgParseAndAddRules(t); }
  catch(e) { alert('Tidak bisa akses clipboard. Gunakan Import File.'); }
}
function orgImportRulesFile(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => orgParseAndAddRules(e.target.result);
  reader.readAsText(file, 'utf-8'); input.value = '';
}
function orgParseAndAddRules(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let added = 0;
  lines.forEach(line => {
    if (/^(pattern|kode|kata kunci)/i.test(line)) return;
    let sep = line.includes('\t') ? '\t' : ',';
    const parts = line.split(sep).map(p => p.replace(/^"|"$/g,'').trim());
    if (parts.length >= 2 && parts[0] && parts[1]) { orgAddRule(parts[0], parts[1], org_rules.length+1); added++; }
  });
  if (added === 0) alert('Tidak ada rule yang berhasil dibaca. Format: kata_kunci,nama_folder (satu per baris).');
}
function orgExportRulesCSV() {
  orgGetRuleValues();
  if (!org_rules.length) { alert('Belum ada rules.'); return; }
  const rows = [['Kata Kunci','Nama Folder','Prioritas']];
  [...org_rules].sort((a,b) => a.priority-b.priority).forEach(r => rows.push([r.pattern, r.folder, r.priority]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  dlText('﻿'+csv, 'rules.csv', 'text/csv');
}
function orgSchedulePreview() { clearTimeout(org_previewTimer); org_previewTimer = setTimeout(orgRenderPreview, 250); }
function orgRenderPreview() {
  orgGetRuleValues();
  if (!org_filteredFiles.length) return;
  const mode = document.querySelector('input[name=orgMatchMode]:checked')?.value ?? 'contains';
  const cs = document.getElementById('org-caseSensitive').checked;
  const noMatchMode = document.getElementById('org-noMatchMode').value;
  const noMatchFolder = document.getElementById('org-noMatchFolder').value.trim() || 'Lainnya';
  const sortedRules = [...org_rules].filter(r => r.pattern && r.folder).sort((a,b) => a.priority-b.priority);
  org_plan = org_filteredFiles.map(f => {
    const fname = cs ? f.name : f.name.toLowerCase();
    let matched = null;
    for (const r of sortedRules) {
      const pat = cs ? r.pattern : r.pattern.toLowerCase();
      let hit = false;
      if (mode==='contains') hit = fname.includes(pat);
      else if (mode==='exact') hit = fname===pat || fname===pat+getExt(f.name).toLowerCase();
      else if (mode==='startswith') hit = fname.startsWith(pat);
      if (hit) { matched = r; break; }
    }
    if (matched) return { file:f, destFolder:matched.folder, rulePat:matched.pattern, status:'ok' };
    if (noMatchMode==='folder') return { file:f, destFolder:noMatchFolder, rulePat:'(tidak cocok)', status:'ok' };
    return { file:f, destFolder:'', rulePat:'(tidak cocok)', status:'skip' };
  });
  const nOk = org_plan.filter(p=>p.status==='ok').length;
  const nSkip = org_plan.filter(p=>p.status==='skip').length;
  const folders = new Set(org_plan.filter(p=>p.status==='ok').map(p=>p.destFolder));
  document.getElementById('org-summaryRow').innerHTML = `
    <div class="stat-item"><div class="n n-total">${org_plan.length}</div><div class="lbl">Total File</div></div>
    <div class="stat-item"><div class="n n-ok">${nOk}</div><div class="lbl">Akan Dipindahkan</div></div>
    <div class="stat-item"><div class="n" style="color:var(--text3)">${nSkip}</div><div class="lbl">Dilewati</div></div>
    <div class="stat-item"><div class="n n-folder">${folders.size}</div><div class="lbl">Folder Dibuat</div></div>`;
  orgRenderPlanTable(org_plan);
  document.getElementById('org-previewCard').style.display = 'block';
  document.getElementById('org-execBtn').disabled = nOk === 0;
}
function orgRenderPlanTable(data) {
  const search = document.getElementById('org-searchFilter').value.toLowerCase();
  const statusF = document.getElementById('org-statusFilter').value;
  const filtered = data.filter(p => {
    if (search && !p.file.name.toLowerCase().includes(search)) return false;
    if (statusF !== 'all' && p.status !== statusF) return false;
    return true;
  });
  document.getElementById('org-previewBody').innerHTML = filtered.map((p,i) => `<tr>
    <td style="color:var(--text3)">${i+1}</td>
    <td class="name-col">${escHtml(p.file.name)}</td>
    <td style="font-family:monospace;font-size:12px;color:var(--text3)">${escHtml(p.rulePat)}</td>
    <td class="${p.status==='ok'?'new-name':''}">${p.destFolder ? escHtml(p.destFolder) : '<span style="color:var(--text3)">tidak dipindahkan</span>'}</td>
    <td>${p.status==='ok'?'<span class="pill pill-ok">Pindahkan</span>':'<span class="pill pill-skip">Lewati</span>'}</td>
  </tr>`).join('');
}
function orgFilterTable() { if (org_plan.length) orgRenderPlanTable(org_plan); }
async function orgExecuteOrganize() {
  const toMove = org_plan.filter(p => p.status === 'ok');
  if (!toMove.length) return;
  document.getElementById('org-execBtn').disabled = true;
  document.getElementById('org-progressWrap').style.display = 'block';
  document.getElementById('org-logCard').style.display = 'block';
  const logEl = document.getElementById('org-log');
  logEl.innerHTML = '';
  const folderHandles = {};
  const neededFolders = [...new Set(toMove.map(p => p.destFolder))];
  logEl.innerHTML += `<div class="log-info">Membuat ${neededFolders.length} folder...</div>`;
  for (const folderName of neededFolders) {
    try {
      const safeName = folderName.replace(/[<>:"/\\|?*]/g,'_').trim();
      folderHandles[folderName] = await org_dirHandle.getDirectoryHandle(safeName, { create:true });
      logEl.innerHTML += `<div class="log-info">  ${escHtml(safeName)}</div>`;
    } catch(e) { logEl.innerHTML += `<div class="log-err">  Gagal buat folder "${escHtml(folderName)}": ${e.message}</div>`; }
  }
  let done = 0, failed = 0;
  for (let i = 0; i < toMove.length; i++) {
    const p = toMove[i];
    const destDirHandle = folderHandles[p.destFolder];
    if (!destDirHandle) { logEl.innerHTML += `<div class="log-err">${escHtml(p.file.name)} - folder tidak tersedia</div>`; failed++; continue; }
    try {
      const file = await p.file.handle.getFile();
      const bytes = await file.arrayBuffer();
      let destName = p.file.name;
      const conflictMode = document.getElementById('org-conflictMode').value;
      let existing; try { existing = await destDirHandle.getFileHandle(destName); } catch(e) { existing = null; }
      if (existing) {
        if (conflictMode === 'skip') { logEl.innerHTML += `<div class="log-skip">${escHtml(p.file.name)} - sudah ada di ${escHtml(p.destFolder)}, dilewati</div>`; done++; continue; }
        const ext = getExt(destName), base = destName.slice(0, destName.length-ext.length);
        let n = 2;
        while (true) { const c = `${base}_${n}${ext}`; try { await destDirHandle.getFileHandle(c); n++; } catch(e) { destName = c; break; } }
      }
      const newHandle = await destDirHandle.getFileHandle(destName, { create:true });
      const writable = await newHandle.createWritable();
      await writable.write(bytes); await writable.close();
      await org_dirHandle.removeEntry(p.file.name);
      logEl.innerHTML += `<div class="log-ok">${escHtml(p.file.name)} &rarr; ${escHtml(p.destFolder)}${destName !== p.file.name ? '/'+escHtml(destName) : ''}</div>`;
      done++;
    } catch(e) { logEl.innerHTML += `<div class="log-err">${escHtml(p.file.name)} - GAGAL: ${e.message}</div>`; failed++; }
    document.getElementById('org-progressBar').style.width = Math.round(((i+1)/toMove.length)*100) + '%';
    document.getElementById('org-progressText').textContent = (i+1) + '/' + toMove.length + ' file diproses';
    logEl.scrollTop = logEl.scrollHeight;
  }
  logEl.innerHTML += `<div class="log-info" style="margin-top:8px;font-weight:bold">Selesai: ${done} berhasil, ${failed} gagal</div>`;
  document.getElementById('org-execStatus').textContent = 'Selesai: ' + done + ' dipindahkan, ' + failed + ' gagal';
  document.getElementById('org-execBtn').disabled = false;
  await orgLoadFiles();
  document.getElementById('org-previewCard').style.display = 'none';
  org_plan = [];
}
function orgCopyLog() { navigator.clipboard.writeText(document.getElementById('org-log').innerText).then(() => toast('Log disalin!')); }

// ============================================================ DOM READY
document.addEventListener('DOMContentLoaded', () => {
  // Suppress welcome overlay auto-show
  localStorage.setItem('pdftools_visited', '1');

  // Compat checks
  if (!('showDirectoryPicker' in window)) {
    document.getElementById('rn-compatWarn').classList.add('show');
    document.getElementById('org-compatWarn').classList.add('show');
  }

  // Organizer noMatchMode listener
  document.getElementById('org-noMatchMode').addEventListener('change', function() {
    document.getElementById('org-noMatchFolder').style.display = this.value === 'folder' ? 'block' : 'none';
    orgSchedulePreview();
  });

  orgRenderRulesTable();
});

