import { zmpAdapter } from "../adapters/zmp/sdkAdapter";

const DEVICE_ID_KEY = "sedinco_device_id";
const DEVICE_FP_KEY = "sedinco_bound_device_fingerprint";
const DEVICE_MODEL_CACHE_KEY = "sedinco_device_model_name";
const IDB_NAME = "sedinco_device_identity_db";
const IDB_STORE = "kv";
const IDB_KEY = "persistent_device_uuid";

export const UNKNOWN_DEVICE_LABEL = "Thiết bị không rõ";

const IOS_SCREEN_MODELS = {
  "320x568@2": "iPhone SE",
  "375x667@2": "iPhone 8",
  "414x736@3": "iPhone 8 Plus",
  "375x812@3": "iPhone 11 Pro",
  "414x896@2": "iPhone 11",
  "414x896@3": "iPhone 11 Pro Max",
  "360x780@3": "iPhone 13 mini",
  "390x844@3": "iPhone 13",
  "428x926@3": "iPhone 14 Plus",
  "393x852@3": "iPhone 15",
  "430x932@3": "iPhone 15 Pro Max",
  "402x874@3": "iPhone 16 Pro",
  "440x956@3": "iPhone 16 Pro Max"
};

const APPLE_HARDWARE_CODES = {
  "iphone8,4": "iPhone SE",
  "iphone10,1": "iPhone 8",
  "iphone10,4": "iPhone 8",
  "iphone10,2": "iPhone 8 Plus",
  "iphone10,5": "iPhone 8 Plus",
  "iphone10,3": "iPhone X",
  "iphone10,6": "iPhone X",
  "iphone11,8": "iPhone XR",
  "iphone11,2": "iPhone XS",
  "iphone11,4": "iPhone XS Max",
  "iphone11,6": "iPhone XS Max",
  "iphone12,1": "iPhone 11",
  "iphone12,3": "iPhone 11 Pro",
  "iphone12,5": "iPhone 11 Pro Max",
  "iphone12,8": "iPhone SE",
  "iphone13,1": "iPhone 12 mini",
  "iphone13,2": "iPhone 12",
  "iphone13,3": "iPhone 12 Pro",
  "iphone13,4": "iPhone 12 Pro Max",
  "iphone14,4": "iPhone 13 mini",
  "iphone14,5": "iPhone 13",
  "iphone14,2": "iPhone 13 Pro",
  "iphone14,3": "iPhone 13 Pro Max",
  "iphone14,6": "iPhone SE",
  "iphone14,7": "iPhone 14",
  "iphone14,8": "iPhone 14 Plus",
  "iphone15,2": "iPhone 14 Pro",
  "iphone15,3": "iPhone 14 Pro Max",
  "iphone15,4": "iPhone 15",
  "iphone15,5": "iPhone 15 Plus",
  "iphone16,1": "iPhone 15 Pro",
  "iphone16,2": "iPhone 15 Pro Max",
  "iphone17,1": "iPhone 16 Pro",
  "iphone17,2": "iPhone 16 Pro Max",
  "iphone17,3": "iPhone 16",
  "iphone17,4": "iPhone 16 Plus"
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
  { re: /2[234]\d{2,}[A-Z0-9]*/i, prefix: "Xiaomi" },
  { re: /V\d{4}[A-Z]?/i, prefix: "vivo" }
];

export function sanitizeSingleDeviceModelName(rawName) {
  if (!rawName || typeof rawName !== "string") return UNKNOWN_DEVICE_LABEL;
  let clean = rawName.trim().slice(0, 100);
  if (!clean || /^Thiết bị di động$/i.test(clean) || /^Mobile Device$/i.test(clean)) {
    return UNKNOWN_DEVICE_LABEL;
  }
  const hwMatch = APPLE_HARDWARE_CODES[clean.toLowerCase()];
  if (hwMatch) return hwMatch;
  if (clean.includes("/")) {
    if (/iPhone\s*SE\s*\/\s*5s/i.test(clean)) return "iPhone SE";
    if (/iPhone\s*8\s*\/\s*SE/i.test(clean)) return "iPhone 8";
    if (/iPhone\s*X\s*\/\s*XS\s*\/\s*11\s*Pro/i.test(clean)) return "iPhone 11 Pro";
    if (/iPhone\s*11\s*\/\s*XR/i.test(clean)) return "iPhone 11";
    if (/iPhone\s*11\s*Pro\s*Max\s*\/\s*XS\s*Max/i.test(clean)) return "iPhone 11 Pro Max";
    if (/iPhone\s*12\s*\/\s*13\s*mini/i.test(clean)) return "iPhone 13 mini";
    if (/iPhone\s*12\s*\/\s*13\s*\/\s*14/i.test(clean)) return "iPhone 13";
    if (/iPhone\s*12\s*\/\s*13\s*Pro\s*Max/i.test(clean)) return "iPhone 14 Plus";
    if (/iPhone\s*14\s*Pro\s*\/\s*15/i.test(clean)) return "iPhone 15";
    if (/iPhone\s*14\s*\/\s*15\s*Pro\s*Max/i.test(clean)) return "iPhone 15 Pro Max";
    if (/Xiaomi\s*\/\s*Redmi/i.test(clean)) return clean.replace(/Xiaomi\s*\/\s*Redmi/i, "Xiaomi").trim();
    const parts = clean.split("/").map((s) => s.trim()).filter(Boolean);
    clean = parts[0] || UNKNOWN_DEVICE_LABEL;
  }
  return clean || UNKNOWN_DEVICE_LABEL;
}

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

  const rawSys = String(info?.system || info?.osVersion || "").trim();
  const iosUaMatch = ua.match(/(?:CPU\s+)?(?:iPhone\s+)?OS\s+([\d_]+)/i);
  const androidUaMatch = ua.match(/Android\s+([\d.]+)/i);
  const iosVer = rawSys && /iOS/i.test(rawSys)
    ? rawSys.replace(/^iOS\s*/i, "").trim()
    : (iosUaMatch ? iosUaMatch[1].replace(/_/g, ".") : (rawSys || ""));
  const androidVer = rawSys && /Android/i.test(rawSys)
    ? rawSys.replace(/^Android\s*/i, "").trim()
    : (androidUaMatch ? androidUaMatch[1] : (rawSys || ""));

  // 1. Lấy thông tin brand & model từ SDK hoặc High-Entropy Client Hints
  const brand = String(info?.brand || "").trim();
  const model = String(info?.model || "").trim();

  if (model && APPLE_HARDWARE_CODES[model.toLowerCase()]) {
    const mapped = APPLE_HARDWARE_CODES[model.toLowerCase()];
    return iosVer ? `${mapped} (iOS ${iosVer})`.slice(0, 100) : mapped;
  }

  // 2. Xử lý riêng iOS (Safari / Zalo WKWebView đôi khi chỉ ghi 'iPhone')
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || /iOS/i.test(String(info?.platform || ""));
  if (isIOS) {
    const verSuffix = iosVer ? ` (iOS ${iosVer})` : "";
    if (/iPad/i.test(ua) || /iPad/i.test(model)) return `Apple iPad${verSuffix}`.slice(0, 100);
    if (model && /iPhone\s*\d+/i.test(model) && !model.includes("/")) {
      return `${sanitizeSingleDeviceModelName(model)}${verSuffix}`.slice(0, 100);
    }
    if (sw > 0 && sh > 0 && dpr > 0) {
      const minSide = Math.min(sw, sh);
      const maxSide = Math.max(sw, sh);
      const key = `${minSide}x${maxSide}@${dpr}`;
      if (IOS_SCREEN_MODELS[key]) return `${IOS_SCREEN_MODELS[key]}${verSuffix}`.slice(0, 100);
    }
    return `iPhone${verSuffix}`.slice(0, 100);
  }

  // 3. Xử lý Android (dịch mã kỹ thuật SM-xxx, CPHxxx, RMXxxx...)
  const uaModelMatch = ua.match(/Android\s+[^;]+;\s*([^;)]+)/i);
  const candidate = model || (uaModelMatch ? uaModelMatch[1].replace(/\s*Build\/.*$/i, "").trim() : "");
  const androidSuffix = androidVer ? ` (Android ${androidVer})` : "";
  if (candidate && !/^K$/i.test(candidate)) {
    for (const pat of ANDROID_MODEL_NAMES) {
      if (pat.re.test(candidate)) {
        const base = pat.name || `${pat.prefix} ${candidate}`;
        return `${base}${androidSuffix}`.slice(0, 100);
      }
    }
    if (brand && !candidate.toLowerCase().startsWith(brand.toLowerCase())) {
      return sanitizeSingleDeviceModelName(`${brand} ${candidate}${androidSuffix}`);
    }
    return sanitizeSingleDeviceModelName(`${candidate}${androidSuffix}`);
  }

  if (/Android/i.test(ua)) return brand ? `${brand}${androidSuffix || " Android"}` : `Android${androidSuffix}`;
  if (/Macintosh|Mac OS/i.test(ua)) return "Trình duyệt macOS";
  if (/Windows/i.test(ua)) return "Trình duyệt Windows";
  if (/Linux/i.test(ua)) return "Trình duyệt Linux";

  try {
    const cached = localStorage.getItem(DEVICE_MODEL_CACHE_KEY);
    if (cached && !cached.includes("/") && cached !== "Thiết bị di động" && cached !== UNKNOWN_DEVICE_LABEL) {
      return sanitizeSingleDeviceModelName(cached);
    }
  } catch {
    // Bỏ qua nếu không có localStorage
  }
  return UNKNOWN_DEVICE_LABEL;
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

function createRandomUuidV4() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback RFC4122 v4
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
    deviceId = localStorage.getItem(DEVICE_ID_KEY) || localStorage.getItem(DEVICE_FP_KEY) || "";
  } catch {
    deviceId = "";
  }

  if (!deviceId) {
    deviceId = createRandomUuidV4();
    try {
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
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
      osVersion: sdkInfo?.system || sdkInfo?.osVersion || "",
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

  // Hỗ trợ đọc thêm User-Agent Client Hints cho Chrome Android / Edge hiện đại khi chưa có sdkInfo.model
  if (!sdkInfo.model && typeof navigator !== "undefined" && navigator.userAgentData?.getHighEntropyValues) {
    try {
      const he = await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]);
      if (he?.model) {
        sdkInfo = { ...sdkInfo, model: he.model, osVersion: sdkInfo.osVersion || he.platformVersion || "" };
      }
    } catch {
      // Trình duyệt từ chối hoặc không hỗ trợ
    }
  }

  // Khôi phục bền vững từ Zalo nativeStorage -> localStorage -> IndexedDB (KHÔNG mất khi đăng xuất)
  try {
    const [nativeId, legacyNativeId] = await Promise.all([
      zmpAdapter.getStorage(DEVICE_ID_KEY).catch(() => null),
      zmpAdapter.getStorage(DEVICE_FP_KEY).catch(() => null)
    ]);
    let resolvedId = String(nativeId || legacyNativeId || "").trim();
    if (!resolvedId) {
      resolvedId =
        (typeof localStorage !== "undefined" &&
          (localStorage.getItem(DEVICE_ID_KEY) || localStorage.getItem(DEVICE_FP_KEY))) ||
        "";
    }
    if (!resolvedId) {
      resolvedId = (await readIndexedDbUuid()) || "";
    }
    if (!resolvedId) {
      resolvedId = createRandomUuidV4();
    }
    await Promise.all([
      zmpAdapter.setStorage(DEVICE_ID_KEY, resolvedId).catch(() => {}),
      zmpAdapter.setStorage(DEVICE_FP_KEY, resolvedId).catch(() => {})
    ]);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DEVICE_ID_KEY, resolvedId);
      localStorage.setItem(DEVICE_FP_KEY, resolvedId);
    }
    writeIndexedDbUuid(resolvedId);
  } catch {
    // Bỏ qua nếu trình duyệt chặn storage
  }

  const identity = getDeviceIdentitySync();
  const asyncModelName = sanitizeSingleDeviceModelName(detectDeviceModelName(sdkInfo));
  if (asyncModelName) {
    identity.device_model_name = asyncModelName;
    identity.device_info.deviceName = asyncModelName;
    identity.device_info.model = sdkInfo?.model || identity.device_info.model;
    identity.device_info.brand = sdkInfo?.brand || identity.device_info.brand;
    identity.device_info.osVersion = sdkInfo?.system || sdkInfo?.osVersion || identity.device_info.osVersion;
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
  const cleanModel = modelName ? sanitizeSingleDeviceModelName(String(modelName)) : "Chưa gắn thiết bị";
  const tag = shortTag ? String(shortTag).trim().toUpperCase().slice(-4) : "";
  if (showShortTag && tag) {
    return `${cleanName} : ${cleanModel} [Máy #${tag}]`;
  }
  return `${cleanName} : ${cleanModel}`;
}

