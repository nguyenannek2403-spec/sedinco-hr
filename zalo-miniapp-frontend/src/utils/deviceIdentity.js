import { zmpAdapter } from "../adapters/zmp/sdkAdapter";

const DEVICE_FP_KEY = "sedinco_bound_device_fingerprint";
const DEVICE_MODEL_CACHE_KEY = "sedinco_device_model_name";
const IDB_NAME = "sedinco_device_identity_db";
const IDB_STORE = "kv";
const IDB_KEY = "persistent_device_uuid";

const IOS_SCREEN_MODELS = {
  "320x568@2": "iPhone SE / 5s",
  "375x667@2": "iPhone 8 / SE",
  "414x736@3": "iPhone 8 Plus",
  "375x812@3": "iPhone X / XS / 11 Pro",
  "414x896@2": "iPhone 11 / XR",
  "414x896@3": "iPhone 11 Pro Max / XS Max",
  "360x780@3": "iPhone 12/13 mini",
  "390x844@3": "iPhone 12 / 13 / 14",
  "428x926@3": "iPhone 12/13 Pro Max / 14 Plus",
  "393x852@3": "iPhone 14 Pro / 15 / 16",
  "430x932@3": "iPhone 14/15 Pro Max / 16 Plus",
  "402x874@3": "iPhone 16 Pro",
  "440x956@3": "iPhone 16 Pro Max"
};

const ANDROID_MODEL_NAMES = [
  { re: /SM-S928/i, name: "Samsung Galaxy S24 Ultra" },
  { re: /SM-S918/i, name: "Samsung Galaxy S23 Ultra" },
  { re: /SM-S908/i, name: "Samsung Galaxy S22 Ultra" },
  { re: /SM-A556/i, name: "Samsung Galaxy A55" },
  { re: /SM-A546/i, name: "Samsung Galaxy A54" },
  { re: /SM-A346/i, name: "Samsung Galaxy A34" },
  { re: /SM-A155/i, name: "Samsung Galaxy A15" },
  { re: /SM-[A-Z0-9]+/i, prefix: "Samsung Galaxy" },
  { re: /CPH\d+/i, prefix: "OPPO" },
  { re: /PG[A-Z]\d+/i, prefix: "OPPO" },
  { re: /RMX\d+/i, prefix: "Realme" },
  { re: /2[234]\d{2,}[A-Z0-9]*/i, prefix: "Xiaomi / Redmi" },
  { re: /V\d{4}[A-Z]?/i, prefix: "vivo" }
];

function fnv1aHex(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const input = String(str || "");
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + ((i + 1) * 31);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0").toUpperCase() + h2.toString(16).padStart(8, "0").toUpperCase();
}

export function computeDeviceShortTag(deviceId = "") {
  const clean = String(deviceId || "").trim();
  if (!clean) return "0000";
  return fnv1aHex(clean).slice(-4);
}

function getCanvasAndWebglTrait() {
  let canvasTrait = "";
  let webglRenderer = "";
  try {
    if (typeof document !== "undefined") {
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 40;
      const ctx = c.getContext && c.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px sans-serif";
        ctx.fillStyle = "#f60";
        ctx.fillRect(10, 4, 40, 12);
        ctx.fillStyle = "#069";
        ctx.fillText("SEDINCO_HW", 4, 8);
        canvasTrait = c.toDataURL().slice(-48);
      }
      const glCanvas = document.createElement("canvas");
      const gl = glCanvas.getContext("webgl") || glCanvas.getContext("experimental-webgl");
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        webglRenderer = dbg
          ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "")
          : String(gl.getParameter(gl.RENDERER) || "");
      }
    }
  } catch {
    // Bỏ qua trong môi trường hạn chế canvas/webgl
  }
  return { canvasTrait, webglRenderer };
}

function getHardwareTraitsSync(sdkInfo = {}) {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const scr = typeof window !== "undefined" && window.screen ? window.screen : {};
  const sw = Number(sdkInfo.screenWidth || scr.width || 0);
  const sh = Number(sdkInfo.screenHeight || scr.height || 0);
  const dpr = Number(sdkInfo.pixelRatio || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1);
  const tz = typeof Intl !== "undefined" ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "") : "";
  const { canvasTrait, webglRenderer } = getCanvasAndWebglTrait();

  const rawTraits = [
    nav.platform || "",
    nav.hardwareConcurrency || "",
    nav.deviceMemory || "",
    sw,
    sh,
    dpr,
    tz,
    canvasTrait,
    webglRenderer,
    sdkInfo.model || "",
    sdkInfo.brand || ""
  ].join("|");

  return {
    sw,
    sh,
    dpr,
    webglRenderer,
    hardwareSignature: fnv1aHex(rawTraits)
  };
}

/**
 * Nhận diện tên đời máy thương mại thân thiện (VD: iPhone 8, Samsung Galaxy S23 Ultra...).
 */
export function detectDeviceModelName(sdkInfo = null) {
  let info = sdkInfo;
  if (!info) {
    try {
      const raw = zmpAdapter.getSystemInfo();
      info = raw && typeof raw.then !== "function" ? raw : {};
    } catch {
      info = {};
    }
  }
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const ua = String(nav.userAgent || "");
  const scr = typeof window !== "undefined" && window.screen ? window.screen : {};
  const sw = Number(info?.screenWidth || scr.width || 0);
  const sh = Number(info?.screenHeight || scr.height || 0);
  const dpr = Math.round(Number(info?.pixelRatio || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1));

  // 1. Kiểm tra cache tên máy nếu zmp-sdk đã resolve trước đó
  const brand = String(info?.brand || "").trim();
  const model = String(info?.model || "").trim();

  // 2. Xử lý riêng iOS (Safari / Zalo WKWebView chỉ ghi 'iPhone')
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || /iOS/i.test(String(info?.platform || ""));
  if (isIOS) {
    if (/iPad/i.test(ua) || /iPad/i.test(model)) return "Apple iPad";
    if (model && /iPhone\s*\d+/i.test(model)) return model;
    if (sw > 0 && sh > 0 && dpr > 0) {
      const minSide = Math.min(sw, sh);
      const maxSide = Math.max(sw, sh);
      const key = `${minSide}x${maxSide}@${dpr}`;
      if (IOS_SCREEN_MODELS[key]) return IOS_SCREEN_MODELS[key];
    }
    return "Apple iPhone";
  }

  // 3. Xử lý Android (dịch mã kỹ thuật SM-xxx, CPHxxx, RMXxxx...)
  const uaModelMatch = ua.match(/Android\s+[^;]+;\s*([^;)]+)/i);
  const candidate = model || (uaModelMatch ? uaModelMatch[1].replace(/\s*Build\/.*$/i, "").trim() : "");
  if (candidate && !/^K$/i.test(candidate)) {
    for (const pat of ANDROID_MODEL_NAMES) {
      if (pat.re.test(candidate)) {
        return pat.name || `${pat.prefix} (${candidate})`;
      }
    }
    if (brand && !candidate.toLowerCase().startsWith(brand.toLowerCase())) {
      return `${brand} ${candidate}`.slice(0, 100);
    }
    return candidate.slice(0, 100);
  }

  if (/Android/i.test(ua)) return brand ? `${brand} Android` : "Điện thoại Android";
  if (/Macintosh|Mac OS/i.test(ua)) return "Máy tính Mac";
  if (/Windows/i.test(ua)) return "Máy tính Windows";

  try {
    const cached = localStorage.getItem(DEVICE_MODEL_CACHE_KEY);
    if (cached) return cached;
  } catch {
    // Bỏ qua nếu không có localStorage
  }
  return "Thiết bị di động";
}

function readIndexedDbUuid() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve("");
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, "readonly");
          const getReq = tx.objectStore(IDB_STORE).get(IDB_KEY);
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result ? String(getReq.result) : "");
          };
          getReq.onerror = () => {
            db.close();
            resolve("");
          };
        } catch {
          resolve("");
        }
      };
      req.onerror = () => resolve("");
    } catch {
      resolve("");
    }
  });
}

function writeIndexedDbUuid(val) {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined" || !val) return resolve(false);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put(val, IDB_KEY);
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function createRandomInstallToken() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    }
  } catch {
    // Fallback ngẫu nhiên
  }
  return Math.random().toString(36).substring(2, 14).toUpperCase();
}

export function getDeviceIdentitySync() {
  let sdkInfo = {};
  try {
    const res = zmpAdapter.getSystemInfo();
    if (res && typeof res.then !== "function") sdkInfo = res;
  } catch {
    sdkInfo = {};
  }

  const traits = getHardwareTraitsSync(sdkInfo);
  const deviceModelName = detectDeviceModelName(sdkInfo);

  let deviceId = "";
  try {
    deviceId = localStorage.getItem(DEVICE_FP_KEY) || "";
  } catch {
    deviceId = "";
  }

  if (!deviceId) {
    const plat = (typeof navigator !== "undefined" ? (navigator.platform || "MOB") : "ZMP")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 8) || "ZMP";
    const installTok = createRandomInstallToken();
    deviceId = `DEV_${plat}_${traits.hardwareSignature.slice(0, 8)}_${installTok}`.slice(0, 96);
    try {
      localStorage.setItem(DEVICE_FP_KEY, deviceId);
      localStorage.setItem(DEVICE_MODEL_CACHE_KEY, deviceModelName);
    } catch {
      // Bỏ qua
    }
    writeIndexedDbUuid(deviceId);
  }

  const shortTag = computeDeviceShortTag(deviceId);
  const nav = typeof navigator !== "undefined" ? navigator : {};

  return {
    device_id: deviceId,
    device_model_name: deviceModelName,
    device_short_tag: shortTag,
    device_info: {
      deviceId,
      deviceName: deviceModelName,
      model: sdkInfo?.model || "",
      brand: sdkInfo?.brand || "",
      platform: sdkInfo?.platform || nav.platform || "Mobile",
      screenWidth: traits.sw,
      screenHeight: traits.sh,
      pixelRatio: traits.dpr,
      hardwareSignature: traits.hardwareSignature,
      shortTag,
      userAgent: String(nav.userAgent || "").slice(0, 240)
    }
  };
}

export async function getDeviceIdentity() {
  let sdkInfo = {};
  try {
    sdkInfo = (await Promise.resolve(zmpAdapter.getSystemInfo())) || {};
  } catch {
    sdkInfo = {};
  }

  // Khôi phục persistent UUID từ IndexedDB nếu người dùng vừa xóa localStorage
  try {
    const existingLs = localStorage.getItem(DEVICE_FP_KEY);
    if (!existingLs) {
      const idbVal = await readIndexedDbUuid();
      if (idbVal) {
        localStorage.setItem(DEVICE_FP_KEY, idbVal);
      }
    } else {
      writeIndexedDbUuid(existingLs);
    }
  } catch {
    // Bỏ qua nếu trình duyệt chặn storage
  }

  const identity = getDeviceIdentitySync();
  const asyncModelName = detectDeviceModelName(sdkInfo);
  if (asyncModelName && asyncModelName !== "Thiết bị di động") {
    identity.device_model_name = asyncModelName;
    identity.device_info.deviceName = asyncModelName;
    identity.device_info.model = sdkInfo?.model || identity.device_info.model;
    identity.device_info.brand = sdkInfo?.brand || identity.device_info.brand;
    try {
      localStorage.setItem(DEVICE_MODEL_CACHE_KEY, asyncModelName);
    } catch {
      // Bỏ qua
    }
  }
  return identity;
}

export function parseKnownDevices(rawJson) {
  if (!rawJson) return [];
  if (Array.isArray(rawJson)) return rawJson;
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Định dạng chuẩn nhãn thiết bị theo quy định:
 * - 1 máy: "Tên nhân viên : Tên thiết bị" (VD: "Nguyễn Văn A : iPhone 8")
 * - >= 2 máy (kể cả trùng model iPhone 8): "Tên nhân viên : Tên thiết bị [Máy #8F2A]"
 */
export function formatEmployeeDeviceLabel(empName, modelName, shortTag = "", showShortTag = false) {
  const cleanName = String(empName || "Nhân viên").trim();
  const cleanModel = String(modelName || "Chưa gắn thiết bị").trim();
  const tag = shortTag ? String(shortTag).trim().toUpperCase().slice(-4) : "";
  if (showShortTag && tag) {
    return `${cleanName} : ${cleanModel} [Máy #${tag}]`;
  }
  return `${cleanName} : ${cleanModel}`;
}

