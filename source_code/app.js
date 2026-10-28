(() => {
  "use strict";

  // 제출용 단일 HTML에는 라이브러리가 미리 들어 있으므로 전역 객체가 있으면 다시 불러오지 않는다
  const LIBS = {
    zip: [{ src: "lib/jszip.min.js", global: "JSZip" }],
    tiff: [{ src: "lib/pako.min.js", global: "pako" }, { src: "lib/UTIF.js", global: "UTIF" }],
    heic: [{ src: "lib/heic2any.min.js", global: "heic2any" }],
  };

  // decode: 브라우저 기본 / tiff / heic,  out: 결과 파일 포맷
  const FORMATS = [
    { key: "jpg",  label: "JPG",  exts: ["jpg", "jpeg", "jfif"], color: "#e8833a", decode: "native", out: "jpg" },
    { key: "png",  label: "PNG",  exts: ["png"],                 color: "#2f80ed", decode: "native", out: "png" },
    { key: "webp", label: "WEBP", exts: ["webp"],                color: "#16a34a", decode: "native", out: "webp" },
    { key: "gif",  label: "GIF",  exts: ["gif"],                 color: "#9b51e0", decode: "native", out: "png" },
    { key: "bmp",  label: "BMP",  exts: ["bmp"],                 color: "#64748b", decode: "native", out: "png" },
    { key: "svg",  label: "SVG",  exts: ["svg"],                 color: "#f2b01e", decode: "native", out: "png" },
    { key: "avif", label: "AVIF", exts: ["avif"],                color: "#0ea5a4", decode: "native", out: "png" },
    { key: "ico",  label: "ICO",  exts: ["ico"],                 color: "#db2777", decode: "native", out: "png" },
    { key: "tiff", label: "TIFF", exts: ["tif", "tiff"],         color: "#7c3aed", decode: "tiff",   out: "png" },
    { key: "heic", label: "HEIC", exts: ["heic", "heif"],        color: "#1b2a8a", decode: "heic",   out: "jpg" },
  ];

  const PRESETS = [
    { id: "insta-square", name: "인스타 정사각", w: 1080, h: 1080, color: "#e1306c", icon: "insta" },
    { id: "insta-portrait", name: "인스타 세로", w: 1080, h: 1350, color: "#c13584", icon: "insta" },
    { id: "story", name: "스토리·릴스·쇼츠", w: 1080, h: 1920, color: "#f56040", icon: "phone" },
    { id: "youtube-thumb", name: "유튜브 썸네일", w: 1280, h: 720, color: "#ff0000", icon: "play" },
    { id: "link-share", name: "링크 공유 (OG)", w: 1200, h: 630, color: "#1877f2", icon: "link" },
    { id: "wallpaper-4k", name: "4K 배경화면", w: 3840, h: 2160, color: "#1b2a8a", icon: "monitor" },
  ];
  const PRESET_ICONS = {
    insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    play: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  };

  const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const MAX_SIDE = 16384;
  const MAX_AREA = 16384 * 16384 / 2;
  const SMALL_SIDE = 900;
  const THUMB_BOX = 70;

  const $ = (s) => document.querySelector(s);
  const dropZone = $("#dropZone");
  const fileInput = $("#fileInput");
  const fileList = $("#fileList");
  const zipBtn = $("#zipBtn");
  const startBtn = $("#startBtn");
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const state = {
    items: [],
    ratio: "1:1",
    mode: "padding",
    bg: "solid",
    preset: null,
    running: false,
  };
  let uid = 0;

  /* ───────── 지원 포맷 아이콘 ───────── */
  const imgIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 17-5-5-9 8"/></svg>';
  $("#formatList").innerHTML = FORMATS.map(
    (f) => `<div class="fmt" style="--c:${f.color}" title="${f.exts.map((e) => "." + e).join(", ")} 지원">${imgIcon}${f.label}</div>`
  ).join("");

  /* ───────── 유틸 ───────── */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const extOf = (name) => (name.split(".").pop() || "").toLowerCase();
  const baseOf = (name) => name.replace(/\.[^.]+$/, "");
  const fmtOf = (file) => {
    const ext = extOf(file.name);
    let f = FORMATS.find((x) => x.exts.includes(ext));
    if (!f && file.type.startsWith("image/")) {
      const sub = file.type.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg").replace("x-icon", "ico").replace("vnd.microsoft.icon", "ico");
      f = FORMATS.find((x) => x.key === sub || x.exts.includes(sub));
    }
    return f || null;
  };
  const humanSize = (b) => (b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB");
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  const loaded = {};
  function loadOne({ src, global }) {
    if (window[global]) return Promise.resolve();
    if (!loaded[src]) {
      loaded[src] = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = res;
        s.onerror = () => { delete loaded[src]; rej(new Error("라이브러리를 불러오지 못했습니다 (lib 폴더 확인)")); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }
  async function loadScript(lib) {
    for (const entry of lib) await loadOne(entry);
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ───────── 저장 위치 선택 (크롬·엣지의 File System Access API) ───────── */
  const PICK_PREF = "smart-photo-pick-save";
  const canPickSave = typeof window.showSaveFilePicker === "function";
  const SAVE_TYPES = {
    jpg: ["JPG 이미지", "image/jpeg"],
    png: ["PNG 이미지", "image/png"],
    webp: ["WEBP 이미지", "image/webp"],
    zip: ["ZIP 압축 파일", "application/zip"],
  };
  const pickSaveOn = () => canPickSave && localStorage.getItem(PICK_PREF) !== "off";

  // 저장 창은 클릭 직후에만 열 수 있으므로, 시간이 걸리는 작업(압축 등)보다 먼저 호출해야 한다.
  // 취소하면 null, 아니면 { write(blob) } 을 돌려준다.
  async function pickSaveTarget(name) {
    if (pickSaveOn()) {
      const ext = extOf(name);
      const t = SAVE_TYPES[ext];
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          id: "smart-photo-save",
          types: t ? [{ description: t[0], accept: { [t[1]]: ["." + ext] } }] : undefined,
        });
        return {
          async write(blob) {
            const w = await handle.createWritable();
            await w.write(blob);
            await w.close();
            toast(`'${handle.name}' 저장 완료`);
          },
        };
      } catch (e) {
        if (e.name === "AbortError") return null;
      }
    }
    return { write: async (blob) => downloadBlob(blob, name) };
  }

  async function saveFile(blob, name) {
    const target = await pickSaveTarget(name);
    if (!target) return false;
    await target.write(blob);
    return true;
  }

  if (canPickSave) {
    $("#pickSaveRow").classList.remove("hidden");
    $("#pickSaveToggle").checked = pickSaveOn();
    $("#pickSaveToggle").addEventListener("change", (e) => {
      localStorage.setItem(PICK_PREF, e.target.checked ? "on" : "off");
      toast(e.target.checked ? "다운로드할 때 저장 위치를 물어봅니다" : "기본 다운로드 폴더에 바로 저장합니다");
    });
  }

  /* ───────── 디코딩 ───────── */
  function loadImageEl(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => res({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("이미지를 읽을 수 없습니다")); };
      img.src = url;
    });
  }

  async function decode(file, fmt) {
    if (fmt.decode === "tiff") {
      await loadScript(LIBS.tiff);
      const buf = await file.arrayBuffer();
      const ifds = UTIF.decode(buf);
      const page = ifds.find((p) => p.width && p.height) || ifds[0];
      UTIF.decodeImage(buf, page);
      const rgba = UTIF.toRGBA8(page);
      const c = document.createElement("canvas");
      c.width = page.width;
      c.height = page.height;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), page.width, page.height), 0, 0);
      return { source: c, width: c.width, height: c.height, url: null };
    }

    let blob = file;
    if (fmt.decode === "heic") {
      try {
        const { img, url } = await loadImageEl(file); // Safari 등은 기본 지원
        return { source: img, width: img.naturalWidth, height: img.naturalHeight, url };
      } catch (_) {
        await loadScript(LIBS.heic);
        const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
        blob = Array.isArray(out) ? out[0] : out;
      }
    }

    const { img, url } = await loadImageEl(blob);
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) { w = 1024; h = 1024; } // 크기 정보가 없는 SVG
    return { source: img, width: w, height: h, url };
  }

  // 미리보기·블러 배경용 축소본과 가장자리 대표 색
  function prepareSmall(item) {
    const s = Math.min(1, SMALL_SIDE / Math.max(item.width, item.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(item.width * s));
    c.height = Math.max(1, Math.round(item.height * s));
    c.getContext("2d").drawImage(item.source, 0, 0, c.width, c.height);
    item.small = c;

    const n = 32;
    const t = document.createElement("canvas");
    t.width = t.height = n;
    const tc = t.getContext("2d", { willReadFrequently: true });
    tc.drawImage(c, 0, 0, n, n);
    const d = tc.getImageData(0, 0, n, n).data;
    let r = 0, g = 0, b = 0, cnt = 0;
    const edge = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (x >= edge && x < n - edge && y >= edge && y < n - edge) continue;
        const i = (y * n + x) * 4, a = d[i + 3] / 255;
        if (a < 0.1) continue;
        r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; cnt += a;
      }
    }
    item.avg = cnt ? `rgb(${Math.round(r / cnt)},${Math.round(g / cnt)},${Math.round(b / cnt)})` : "#ffffff";
  }

  /* ───────── 레이아웃 & 그리기 (미리보기·결과 공용) ───────── */
  function computeLayout(iw, ih, opts, focus) {
    const r = opts.ratio.w / opts.ratio.h;
    let cw, ch;
    if (opts.mode === "padding") {
      if (iw / ih > r) { cw = iw; ch = iw / r; } else { ch = ih; cw = ih * r; }
    } else {
      if (iw / ih > r) { ch = ih; cw = ih * r; } else { cw = iw; ch = iw / r; }
    }
    let scale = 1;
    if (opts.longSide) scale = opts.longSide / Math.max(cw, ch);
    scale = Math.min(scale, MAX_SIDE / Math.max(cw, ch), Math.sqrt(MAX_AREA / (cw * ch)));
    const W = Math.max(1, Math.round(cw * scale));
    const H = Math.max(1, Math.round(ch * scale));

    const s = opts.mode === "padding" ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
    const dw = iw * s, dh = ih * s;
    const fx = opts.mode === "crop" ? focus.x : 0.5;
    const fy = opts.mode === "crop" ? focus.y : 0.5;
    return { W, H, dx: (W - dw) * fx, dy: (H - dh) * fy, dw, dh };
  }

  // 블러는 저해상도 캔버스에서 처리한 뒤 확대해 큰 결과물에서도 빠르게 만든다
  function drawBlurBackground(ctx, small, W, H) {
    const k = Math.max(1, Math.max(W, H) / 360);
    const bw = Math.ceil(W / k), bh = Math.ceil(H / k);
    const radius = Math.max(bw, bh) / 22;
    const pad = radius * 3;
    const s = Math.max((bw + pad * 2) / small.width, (bh + pad * 2) / small.height);
    const dw = small.width * s, dh = small.height * s;

    const b = document.createElement("canvas");
    b.width = bw;
    b.height = bh;
    const bc = b.getContext("2d");
    if ("filter" in bc) {
      bc.filter = `blur(${radius}px) saturate(1.15)`;
      bc.drawImage(small, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
      bc.filter = "none";
    } else {
      const t = document.createElement("canvas");
      t.width = Math.max(2, Math.round(bw / 14));
      t.height = Math.max(2, Math.round(bh / 14));
      const tc = t.getContext("2d");
      const ts = Math.max(t.width / small.width, t.height / small.height);
      tc.drawImage(small, (t.width - small.width * ts) / 2, (t.height - small.height * ts) / 2, small.width * ts, small.height * ts);
      bc.imageSmoothingQuality = "high";
      bc.drawImage(t, 0, 0, bw, bh);
    }
    bc.fillStyle = "rgba(0,0,0,0.12)";
    bc.fillRect(0, 0, bw, bh);

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(b, 0, 0, W, H);
  }

  function paint(ctx, item, L, opts, k, src, outExt) {
    const W = L.W * k, H = L.H * k;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (opts.mode === "padding") {
      if (opts.bg === "blur") drawBlurBackground(ctx, item.small, W, H);
      else if (!opts.transparent) {
        ctx.fillStyle = opts.bg === "auto" ? item.avg : opts.padColor;
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.drawImage(src, L.dx * k, L.dy * k, L.dw * k, L.dh * k);
    if (outExt === "jpg") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function getOpts() {
    const ratio = getRatio();
    if (!ratio) return null;
    const ls = parseInt($("#longSide").value, 10);
    return {
      ratio,
      mode: state.mode,
      bg: state.bg,
      longSide: ls >= 16 ? Math.min(ls, MAX_SIDE) : null,
      padColor: $("#padColor").value,
      transparent: state.bg === "solid" && $("#padTransparent").checked,
    };
  }

  // box: 캔버스가 들어갈 CSS 픽셀 크기
  function renderPreview(canvas, item, opts, box) {
    const L = computeLayout(item.width, item.height, opts, item.focus);
    const k = (box * DPR) / Math.max(L.W, L.H);
    canvas.width = Math.max(1, Math.round(L.W * k));
    canvas.height = Math.max(1, Math.round(L.H * k));
    canvas.style.width = canvas.width / DPR + "px";
    canvas.style.height = canvas.height / DPR + "px";
    canvas.classList.toggle("checker", opts.mode === "padding" && opts.transparent);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, item, L, opts, k, item.small, null);
    return { L, k };
  }

  /* ───────── 파일 추가 ───────── */
  async function addFiles(fileArr) {
    const files = Array.from(fileArr);
    if (!files.length) return;
    let rejected = 0;

    for (const file of files) {
      const fmt = fmtOf(file);
      if (!fmt) { rejected++; continue; }
      const item = { id: ++uid, file, fmt, status: "loading", progress: 0, result: null, focus: { x: 0.5, y: 0.5 }, selected: true };
      state.items.push(item);
      renderItem(item);
      decode(file, fmt)
        .then((d) => {
          Object.assign(item, d, { status: "ready" });
          prepareSmall(item);
          updateItem(item);
          updateThumb(item);
        })
        .catch((e) => { item.status = "error"; item.error = e.message; updateItem(item); })
        .finally(refreshUI);
    }
    if (rejected) toast(`지원하지 않는 형식의 파일 ${rejected}개는 제외했습니다`);
    refreshUI();
  }

  /* ───────── 목록 렌더링 ───────── */
  const dlIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/></svg>';

  function renderItem(item) {
    const li = document.createElement("li");
    li.className = "file-item";
    li.dataset.id = item.id;
    li.innerHTML = `
      <label class="item-check" title="변환할 파일로 선택"><input type="checkbox" checked /></label>
      <button type="button" class="thumb" title="크게 보고 위치 조정하기">불러오는 중</button>
      <div class="file-info">
        <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
        <div class="file-meta"></div>
        <div class="progress-row">
          <div class="progress"><div class="progress-bar"></div></div>
          <span class="pct">0%</span>
          <button type="button" class="dl-btn" disabled title="작업 완료 후 다운로드할 수 있습니다">${dlIcon}</button>
        </div>
      </div>
      <div class="item-actions">
        <button type="button" class="conv-btn" title="이 파일만 현재 옵션으로 변환">이 파일만 변환</button>
        <button type="button" class="rm-btn" title="목록에서 제거">×</button>
      </div>`;
    li.querySelector(".item-check input").addEventListener("change", (e) => {
      item.selected = e.target.checked;
      updateItem(item);
      refreshUI();
    });
    li.querySelector(".conv-btn").addEventListener("click", () => runConvert([item]));
    li.querySelector(".thumb").addEventListener("click", () => {
      if (item.small) openEditor(item);
    });
    li.querySelector(".dl-btn").addEventListener("click", async () => {
      const result = item.result;
      if (!result) return;
      try {
        if (await saveFile(result.blob, result.name)) saveHistory([result], "single");
      } catch (e) {
        toast("저장 실패: " + e.message);
      }
    });
    li.querySelector(".rm-btn").addEventListener("click", () => removeItem(item));
    item.el = li;
    fileList.appendChild(li);
    updateItem(item);
  }

  function updateThumb(item) {
    if (!item.el || !item.small) return;
    const thumb = item.el.querySelector(".thumb");
    if (!thumb.classList.contains("ready")) {
      thumb.textContent = "";
      thumb.classList.add("ready");
      thumb.innerHTML = '<canvas></canvas><span class="edit-tag">미리보기</span>';
    }
    const opts = getOpts();
    if (opts) renderPreview(thumb.querySelector("canvas"), item, opts, THUMB_BOX);
  }

  function updateItem(item) {
    const el = item.el;
    if (!el) return;

    const meta = [`<span class="badge" style="--c:${item.fmt.color}">${item.fmt.label}</span>`, humanSize(item.file.size)];
    if (item.width) meta.push(`${item.width}×${item.height}`);
    if (state.mode === "crop" && (item.focus.x !== 0.5 || item.focus.y !== 0.5)) meta.push('<span class="moved-tag">위치 조정됨</span>');
    if (item.status === "error") meta.push(`<span class="err-text">${escapeHtml(item.error || "오류")}</span>`);
    if (item.result) {
      meta.push(`→ <span class="out-name">${escapeHtml(item.result.name)}</span>`);
      if (item.status === "done" && item.result.sig !== sigOf(getOpts(), item)) meta.push('<span class="stale-tag">현재 옵션과 다름</span>');
    }
    el.querySelector(".file-meta").innerHTML = meta.join(" · ");

    el.querySelector(".progress-bar").style.width = item.progress + "%";
    el.querySelector(".pct").textContent = item.status === "error" ? "실패" : Math.round(item.progress) + "%";

    const dl = el.querySelector(".dl-btn");
    dl.disabled = item.status !== "done";
    dl.title = item.status === "done" ? `${item.result.name} 다운로드` : "작업 완료 후 다운로드할 수 있습니다";

    el.querySelector(".item-check input").checked = item.selected;
    el.querySelector(".item-check input").disabled = state.running;
    el.querySelector(".conv-btn").disabled = state.running || !(item.status === "ready" || item.status === "done");

    el.classList.toggle("done", item.status === "done");
    el.classList.toggle("error", item.status === "error");
    el.classList.toggle("unselected", !item.selected);
  }

  function sigOf(opts, item) {
    if (!opts) return null;
    return JSON.stringify([
      opts.ratio.w, opts.ratio.h, opts.mode, opts.longSide,
      opts.mode === "padding" ? [opts.bg, opts.bg === "solid" ? [opts.padColor, opts.transparent] : null] : null,
      opts.mode === "crop" ? [item.focus.x, item.focus.y] : null,
    ]);
  }

  function removeItem(item) {
    if (state.running) return toast("변환 중에는 제거할 수 없습니다");
    if (item.url) URL.revokeObjectURL(item.url);
    item.el.remove();
    state.items = state.items.filter((x) => x !== item);
    refreshUI();
  }

  function refreshUI() {
    const n = state.items.length;
    $("#fileCount").textContent = n;
    $("#listPanel").classList.toggle("hidden", n === 0);
    $("#optionsPanel").classList.toggle("hidden", n === 0);

    const valid = state.items.filter((x) => x.status !== "error" || x.result);
    const allDone = valid.length > 0 && valid.every((x) => x.status === "done");
    zipBtn.disabled = !allDone || state.running;

    const waiting = state.items.some((x) => x.status === "loading");
    const sel = state.items.filter((x) => x.selected);
    const selConvertible = sel.filter((x) => x.status === "ready" || x.status === "done");
    startBtn.disabled = state.running || waiting || !selConvertible.length;
    startBtn.textContent = state.running ? "변환 중…"
      : waiting ? "사진 불러오는 중…"
      : !sel.length ? "변환할 파일을 선택하세요"
      : sel.length === n ? (allDone ? "전체 다시 변환" : `전체 ${selConvertible.length}개 변환`)
      : `선택한 ${selConvertible.length}개 변환`;

    const selectAll = $("#selectAll");
    selectAll.checked = n > 0 && sel.length === n;
    selectAll.indeterminate = sel.length > 0 && sel.length < n;
    selectAll.disabled = state.running;
    $("#selCount").textContent = n && sel.length < n ? `${sel.length}개 선택됨` : "";
  }

  $("#selectAll").addEventListener("change", (e) => {
    state.items.forEach((x) => { x.selected = e.target.checked; updateItem(x); });
    refreshUI();
  });

  /* ───────── 옵션 ───────── */
  $("#presetGroup").innerHTML = PRESETS.map(
    (p) => `<button type="button" class="preset" data-id="${p.id}" style="--c:${p.color}">
      <span class="p-icon"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PRESET_ICONS[p.icon]}</svg></span>
      <span class="p-text"><strong>${p.name}</strong><small>${p.w} × ${p.h}</small></span>
    </button>`
  ).join("");

  function setRatioChip(ratio) {
    state.ratio = ratio;
    document.querySelectorAll("#ratioGroup .chip").forEach((c) => c.classList.toggle("active", c.dataset.ratio === ratio));
    $("#customRatio").classList.toggle("hidden", ratio !== "custom");
  }

  function setPreset(p) {
    state.preset = p;
    document.querySelectorAll("#presetGroup .preset").forEach((b) => b.classList.toggle("active", !!p && b.dataset.id === p.id));
  }

  $("#presetGroup").addEventListener("click", (e) => {
    const btn = e.target.closest(".preset");
    if (!btn) return;
    const p = PRESETS.find((x) => x.id === btn.dataset.id);
    if (state.preset === p) return;
    const g = gcd(p.w, p.h);
    const rw = p.w / g, rh = p.h / g;
    const std = `${rw}:${rh}`;
    if ([...document.querySelectorAll("#ratioGroup .chip")].some((c) => c.dataset.ratio === std)) {
      setRatioChip(std);
    } else {
      setRatioChip("custom");
      $("#customW").value = rw;
      $("#customH").value = rh;
    }
    $("#longSide").value = Math.max(p.w, p.h);
    setPreset(p);
    onOptionsChange();
  });

  $("#ratioGroup").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    setRatioChip(btn.dataset.ratio);
    setPreset(null);
    onOptionsChange();
  });
  $("#modeGroup").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    document.querySelectorAll("#modeGroup .seg-btn").forEach((c) => c.classList.toggle("active", c === btn));
    state.mode = btn.dataset.mode;
    $("#paddingOpts").classList.toggle("hidden", state.mode !== "padding");
    onOptionsChange();
  });
  $("#bgGroup").addEventListener("click", (e) => {
    const btn = e.target.closest(".mini");
    if (!btn) return;
    document.querySelectorAll("#bgGroup .mini").forEach((c) => c.classList.toggle("active", c === btn));
    state.bg = btn.dataset.bg;
    $("#solidOpts").classList.toggle("hidden", state.bg !== "solid");
    onOptionsChange();
  });
  ["#customW", "#customH", "#longSide"].forEach((s) => $(s).addEventListener("input", () => { setPreset(null); onOptionsChange(); }));
  ["#padColor", "#padTransparent"].forEach((s) => $(s).addEventListener("input", onOptionsChange));

  // 완료된 결과는 유지하고, 현재 옵션과 달라진 항목에만 표시를 붙인다 (파일별로 다른 옵션 적용 가능)
  function onOptionsChange() {
    for (const it of state.items) {
      updateItem(it);
      updateThumb(it);
    }
    refreshUI();
  }

  function getRatio() {
    if (state.ratio === "custom") {
      const w = parseFloat($("#customW").value), h = parseFloat($("#customH").value);
      if (!(w > 0 && h > 0)) return null;
      return { w, h, label: `${w}x${h}` };
    }
    const [w, h] = state.ratio.split(":").map(Number);
    return { w, h, label: `${w}x${h}` };
  }

  /* ───────── 편집 모달 (크게 보기 + Crop 위치 드래그) ───────── */
  const editor = $("#editor");
  const edCanvas = $("#edCanvas");
  const edStage = $("#edStage");
  const ed = { item: null, view: null, drag: null };

  function editableItems() {
    return state.items.filter((x) => x.small);
  }

  function openEditor(item) {
    if (!getOpts()) return toast("커스텀 비율을 올바르게 입력해 주세요");
    ed.item = item;
    editor.classList.remove("hidden");
    drawEditor();
  }

  function closeEditor() {
    editor.classList.add("hidden");
    ed.item = null;
    ed.drag = null;
  }

  function drawEditor() {
    const item = ed.item;
    const opts = getOpts();
    if (!item || !opts) return;
    const box = Math.max(200, Math.min(560, window.innerWidth - 120, window.innerHeight - 300));
    ed.view = renderPreview(edCanvas, item, opts, box);

    const list = editableItems();
    const idx = list.indexOf(item);
    $("#edTitle").textContent = item.file.name;
    $("#edMeta").textContent = `${idx + 1} / ${list.length} · 원본 ${item.width}×${item.height} → 결과 ${ed.view.L.W}×${ed.view.L.H}`;

    const canDrag = opts.mode === "crop" && (ed.view.L.dw > ed.view.L.W + 0.5 || ed.view.L.dh > ed.view.L.H + 0.5);
    edStage.classList.toggle("draggable", canDrag);
    $("#edCenter").disabled = !canDrag || (item.focus.x === 0.5 && item.focus.y === 0.5);
    $("#edHint").textContent = opts.mode === "crop"
      ? canDrag ? "사진을 드래그해서 살릴 부분을 정하세요." : "이 사진은 이미 비율이 맞아 잘리는 부분이 없습니다."
      : "Padding 모드 미리보기입니다. Crop 모드에서는 드래그로 위치를 조정할 수 있어요.";
    $("#edPrev").disabled = idx <= 0;
    $("#edNext").disabled = idx >= list.length - 1;
  }

  function setFocus(item, x, y) {
    item.focus.x = clamp01(x);
    item.focus.y = clamp01(y);
    updateItem(item);
    updateThumb(item);
    drawEditor();
  }

  edCanvas.addEventListener("pointerdown", (e) => {
    if (!edStage.classList.contains("draggable")) return;
    try { edCanvas.setPointerCapture(e.pointerId); } catch (_) {}
    ed.drag = { x: e.clientX, y: e.clientY, fx: ed.item.focus.x, fy: ed.item.focus.y };
    edStage.classList.add("dragging");
  });
  edCanvas.addEventListener("pointermove", (e) => {
    if (!ed.drag) return;
    const { L, k } = ed.view;
    const ox = ((L.W - L.dw) * k) / DPR; // 잘려 나가는 폭 (음수, CSS px)
    const oy = ((L.H - L.dh) * k) / DPR;
    const nx = ox < -0.5 ? ed.drag.fx + (e.clientX - ed.drag.x) / ox : ed.item.focus.x;
    const ny = oy < -0.5 ? ed.drag.fy + (e.clientY - ed.drag.y) / oy : ed.item.focus.y;
    ed.item.focus.x = clamp01(nx);
    ed.item.focus.y = clamp01(ny);
    drawEditor();
  });
  const endDrag = () => {
    if (!ed.drag) return;
    ed.drag = null;
    edStage.classList.remove("dragging");
    setFocus(ed.item, ed.item.focus.x, ed.item.focus.y);
  };
  edCanvas.addEventListener("pointerup", endDrag);
  edCanvas.addEventListener("pointercancel", endDrag);

  const stepEditor = (d) => {
    const list = editableItems();
    const next = list[list.indexOf(ed.item) + d];
    if (next) { ed.item = next; drawEditor(); }
  };
  $("#edPrev").addEventListener("click", () => stepEditor(-1));
  $("#edNext").addEventListener("click", () => stepEditor(1));
  $("#edCenter").addEventListener("click", () => setFocus(ed.item, 0.5, 0.5));
  $("#edDone").addEventListener("click", closeEditor);
  $("#edClose").addEventListener("click", closeEditor);
  editor.addEventListener("click", (e) => { if (e.target === editor) closeEditor(); });
  window.addEventListener("keydown", (e) => {
    if (editor.classList.contains("hidden")) return;
    if (e.key === "Escape") closeEditor();
    else if (e.key === "ArrowLeft") stepEditor(-1);
    else if (e.key === "ArrowRight") stepEditor(1);
  });
  window.addEventListener("resize", () => { if (ed.item) drawEditor(); });

  /* ───────── 변환 ───────── */
  async function setProgress(item, p) {
    item.progress = p;
    updateItem(item);
    await sleep(90);
  }

  const tagOf = (opts) => (state.preset ? state.preset.id : `${opts.ratio.label}_${opts.mode}`);

  async function processItem(item, opts) {
    item.status = "processing";
    item.result = null;
    await setProgress(item, 10);

    const L = computeLayout(item.width, item.height, opts, item.focus);
    let outExt = item.fmt.out;
    if (opts.mode === "padding" && opts.transparent && outExt === "jpg") outExt = "png";
    await setProgress(item, 30);

    const c = document.createElement("canvas");
    c.width = L.W;
    c.height = L.H;
    paint(c.getContext("2d"), item, L, opts, 1, item.source, outExt);
    await setProgress(item, 65);

    let blob = await new Promise((r) => c.toBlob(r, MIME[outExt], 0.92));
    if (!blob || (outExt === "webp" && blob.type !== "image/webp")) {
      outExt = "png";
      blob = await new Promise((r) => c.toBlob(r, "image/png"));
    }
    if (!blob) throw new Error("이미지 저장 실패 (해상도가 너무 큽니다)");
    await setProgress(item, 90);

    const tag = tagOf(opts);
    item.result = {
      blob,
      tag,
      sig: sigOf(opts, item),
      width: L.W,
      height: L.H,
      name: `${baseOf(item.file.name)}_resized_${tag}_${L.W}x${L.H}.${outExt}`,
    };
    item.status = "done";
    await setProgress(item, 100);
  }

  startBtn.addEventListener("click", () => {
    runConvert(state.items.filter((x) => x.selected));
  });

  async function runConvert(list) {
    if (state.running) return;
    const opts = getOpts();
    if (!opts) return toast("커스텀 비율을 올바르게 입력해 주세요");

    const targets = list.filter((x) => x.status === "ready" || x.status === "done");
    if (!targets.length) return;
    state.running = true;
    targets.forEach((x) => { x.status = "ready"; x.progress = 0; x.result = null; });
    state.items.forEach(updateItem);
    refreshUI();

    for (const item of targets) {
      try {
        await processItem(item, opts);
      } catch (e) {
        item.status = "error";
        item.error = e.message;
        updateItem(item);
      }
    }

    state.running = false;
    state.items.forEach(updateItem);
    refreshUI();
    const ok = targets.filter((x) => x.status === "done").length;
    toast(`${ok}개 파일 변환 완료${ok < targets.length ? ` (실패 ${targets.length - ok}개)` : ""}`);
  }

  /* ───────── 일괄 다운로드 ───────── */
  async function buildZip(entries, onProgress) {
    await loadScript(LIBS.zip);
    const zip = new JSZip();
    const used = new Set();
    for (const e of entries) {
      let name = e.name, i = 1;
      while (used.has(name)) name = e.name.replace(/(\.[^.]+)$/, `_${i++}$1`);
      used.add(name);
      zip.file(name, e.blob);
    }
    return zip.generateAsync({ type: "blob" }, (m) => onProgress && onProgress(Math.round(m.percent)));
  }

  function timeStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  zipBtn.addEventListener("click", async () => {
    const done = state.items.filter((x) => x.status === "done");
    if (!done.length) return;
    const label = $("#zipLabel");
    const results = done.map((x) => x.result);
    const tags = new Set(results.map((r) => r.tag));
    const tag = tags.size === 1 ? [...tags][0] : "mixed";
    const target = await pickSaveTarget(`resized_images_${tag}_${done.length}files_${timeStamp()}.zip`);
    if (!target) return;
    zipBtn.disabled = true;
    try {
      label.textContent = "압축 준비 중…";
      const blob = await buildZip(results, (p) => { label.textContent = `압축 중… ${p}%`; });
      await target.write(blob);
      saveHistory(results, "zip");
    } catch (e) {
      toast(e.message);
    } finally {
      label.textContent = "일괄 다운로드 (.zip)";
      refreshUI();
    }
  });

  $("#clearBtn").addEventListener("click", () => {
    if (state.running) return toast("변환 중에는 지울 수 없습니다");
    state.items.forEach((x) => x.url && URL.revokeObjectURL(x.url));
    state.items = [];
    fileList.innerHTML = "";
    refreshUI();
  });

  /* ───────── 다운로드 기록 (IndexedDB) ───────── */
  const HISTORY_DB = "smart-photo-history";
  const HISTORY_STORE = "files";
  const HISTORY_PREF = "smart-photo-history-enabled";
  const historyDrawer = $("#historyDrawer");
  let dbPromise = null;
  let historyThumbUrls = [];

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        if (!("indexedDB" in window)) return rej(new Error("이 브라우저는 기록 저장을 지원하지 않습니다"));
        const req = indexedDB.open(HISTORY_DB, 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(HISTORY_STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("createdAt", "createdAt");
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => { dbPromise = null; rej(req.error); };
      });
    }
    return dbPromise;
  }

  async function dbRun(mode, fn) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(HISTORY_STORE, mode);
      const out = fn(tx.objectStore(HISTORY_STORE));
      tx.oncomplete = () => res(out && "result" in out ? out.result : undefined);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error("저장 공간이 부족합니다"));
    });
  }

  const historyEnabled = () => localStorage.getItem(HISTORY_PREF) !== "off";

  async function makeHistoryThumb(blob) {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 160 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return new Promise((r) => c.toBlob(r, "image/webp", 0.8));
  }

  // 같은 결과물을 여러 번 내려받아도 기록은 한 번만 남긴다
  async function saveHistory(results, via) {
    if (!historyEnabled()) return;
    const fresh = results.filter((r) => !r.savedId);
    if (!fresh.length) return;
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      for (const r of fresh) {
        const thumb = await makeHistoryThumb(r.blob).catch(() => null);
        const rec = {
          name: r.name, blob: r.blob, thumb,
          size: r.blob.size, width: r.width, height: r.height,
          via, createdAt: Date.now(),
        };
        r.savedId = await dbRun("readwrite", (s) => s.add(rec));
      }
      await refreshHistoryCount(true);
      if (!historyDrawer.classList.contains("hidden")) renderHistory();
    } catch (e) {
      toast("기록 저장 실패: " + (e.message || "저장 공간을 확인해 주세요"));
    }
  }

  async function getAllHistory() {
    const list = await dbRun("readonly", (s) => s.getAll());
    return (list || []).sort((a, b) => b.createdAt - a.createdAt);
  }

  async function refreshHistoryCount(bump) {
    try {
      const n = await dbRun("readonly", (s) => s.count());
      const badge = $("#historyCount");
      badge.textContent = n;
      badge.classList.toggle("hidden", !n);
      if (bump) {
        badge.classList.remove("bump");
        void badge.offsetWidth;
        badge.classList.add("bump");
      }
    } catch (_) {}
  }

  function dayLabel(ts) {
    const d = new Date(ts);
    const today = new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
    if (diff === 0) return "오늘";
    if (diff === 1) return "어제";
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  const timeLabel = (ts) => new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  const reDlIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/></svg>';
  const trashIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';

  async function renderHistory() {
    let list = [];
    try { list = await getAllHistory(); } catch (e) { toast(e.message); }
    historyThumbUrls.forEach((u) => URL.revokeObjectURL(u));
    historyThumbUrls = [];

    const ul = $("#historyList");
    ul.innerHTML = "";
    let lastDay = null;
    for (const rec of list) {
      const day = dayLabel(rec.createdAt);
      if (day !== lastDay) {
        const h = document.createElement("li");
        h.className = "history-day";
        h.textContent = day;
        ul.appendChild(h);
        lastDay = day;
      }
      const li = document.createElement("li");
      li.className = "history-item";
      const dims = rec.width ? `${rec.width}×${rec.height} · ` : "";
      li.innerHTML = `
        <div class="h-thumb"></div>
        <div class="h-info">
          <div class="h-name" title="${escapeHtml(rec.name)}">${escapeHtml(rec.name)}</div>
          <div class="h-meta">${timeLabel(rec.createdAt)} · ${dims}${humanSize(rec.size)} <span class="h-via">${rec.via === "zip" ? "ZIP" : "개별"}</span></div>
        </div>
        <div class="h-actions">
          <button type="button" class="icon-btn" title="다시 다운로드">${reDlIcon}</button>
          <button type="button" class="icon-btn del" title="기록에서 삭제">${trashIcon}</button>
        </div>`;
      if (rec.thumb) {
        const u = URL.createObjectURL(rec.thumb);
        historyThumbUrls.push(u);
        li.querySelector(".h-thumb").style.backgroundImage = `url("${u}")`;
      }
      const [reBtn, delBtn] = li.querySelectorAll(".icon-btn");
      reBtn.addEventListener("click", () => saveFile(rec.blob, rec.name).catch((e) => toast("저장 실패: " + e.message)));
      delBtn.addEventListener("click", async () => {
        await dbRun("readwrite", (s) => s.delete(rec.id));
        forgetSaved([rec.id]);
        renderHistory();
        refreshHistoryCount();
      });
      ul.appendChild(li);
    }

    $("#historyEmpty").classList.toggle("hidden", list.length > 0);
    $("#historyZip").disabled = !list.length;
    $("#historyClear").disabled = !list.length;

    const total = list.reduce((a, r) => a + r.size, 0);
    $("#historyUsage").textContent = list.length
      ? `${list.length}개 파일 · ${humanSize(total)} · 이 브라우저에만 저장됩니다`
      : "이 브라우저에만 저장됩니다";
  }

  // 기록에서 지운 결과물은 다시 다운로드하면 새로 저장되도록
  function forgetSaved(ids) {
    for (const it of state.items) {
      if (it.result && (ids === null || ids.includes(it.result.savedId))) delete it.result.savedId;
    }
  }

  function openHistory() {
    historyDrawer.classList.remove("hidden");
    $("#historyToggle").checked = historyEnabled();
    renderHistory();
  }
  const closeHistory = () => historyDrawer.classList.add("hidden");

  $("#historyBtn").addEventListener("click", openHistory);
  $("#historyClose").addEventListener("click", closeHistory);
  historyDrawer.querySelector(".drawer-backdrop").addEventListener("click", closeHistory);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !historyDrawer.classList.contains("hidden")) closeHistory();
  });
  $("#historyToggle").addEventListener("change", (e) => {
    localStorage.setItem(HISTORY_PREF, e.target.checked ? "on" : "off");
    toast(e.target.checked ? "이제 다운로드한 파일이 기록에 저장됩니다" : "기록 저장을 껐습니다 (기존 기록은 유지)");
  });
  $("#historyClear").addEventListener("click", async () => {
    if (!confirm("저장된 다운로드 기록을 모두 삭제할까요?")) return;
    await dbRun("readwrite", (s) => s.clear());
    forgetSaved(null);
    renderHistory();
    refreshHistoryCount();
  });
  $("#historyZip").addEventListener("click", async () => {
    const btn = $("#historyZip");
    const count = $("#historyList").querySelectorAll(".history-item").length;
    if (!count) return;
    const target = await pickSaveTarget(`resized_images_history_${count}files_${timeStamp()}.zip`);
    if (!target) return;
    btn.disabled = true;
    try {
      const list = await getAllHistory();
      const blob = await buildZip(list, (p) => { btn.textContent = `압축 중… ${p}%`; });
      await target.write(blob);
    } catch (e) {
      toast(e.message);
    } finally {
      btn.textContent = "모두 ZIP으로 받기";
      btn.disabled = false;
    }
  });

  refreshHistoryCount();

  /* ───────── 업로드 이벤트 ───────── */
  $("#pickBtn").addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });

  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; dropZone.classList.add("dragover"); });
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropZone.classList.remove("dragover"); } });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  refreshUI();
})();
