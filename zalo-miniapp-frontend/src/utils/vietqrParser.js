import jsQR from "jsqr";
import { findBankByCodeOrBin } from "./vietnamBanks.js";

const PLACEHOLDER_HOLDER_NAMES = new Set([
  "NA",
  "N/A",
  "N.A",
  "VIETQR",
  "NAPAS",
  "MERCHANT",
  "KHACH HANG",
  "CHU TAI KHOAN",
  "USER",
  "UNKNOWN",
  "NULL",
  "NONE"
]);

export function toUpperUnaccentedName(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMeaningfulHolderName(rawName) {
  const normalized = toUpperUnaccentedName(rawName);
  if (!normalized || normalized.length < 2) return false;
  if (PLACEHOLDER_HOLDER_NAMES.has(normalized)) return false;
  const compact = normalized.replace(/\s+/g, "");
  if (PLACEHOLDER_HOLDER_NAMES.has(compact)) return false;
  return true;
}

/**
 * Đọc đệ quy chuỗi chuẩn EMVCo TLV (Tag 2 ký tự + Length 2 ký tự + Value).
 */
export function parseEmvTlv(payload, { recursive = false, maxDepth = 4, _depth = 0 } = {}) {
  const out = {};
  if (!payload || typeof payload !== "string") return out;
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    if (!/^[A-Za-z0-9]{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) break;
    const len = parseInt(lenStr, 10);
    const valStart = i + 4;
    if (len < 0 || valStart + len > payload.length) break;
    const val = payload.slice(valStart, valStart + len);
    if (recursive && _depth < maxDepth && len >= 4 && /^\d{2}\d{2}/.test(val)) {
      const sub = parseEmvTlv(val, { recursive: true, maxDepth, _depth: _depth + 1 });
      out[tag] = Object.keys(sub).length > 0 ? { raw: val, children: sub } : val;
    } else {
      out[tag] = val;
    }
    i = valStart + len;
  }
  return out;
}

function sanitizeAccountOrNickname(rawVal) {
  return String(rawVal || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .trim();
}

function extractBeneficiaryFromMerchantTag(tagRaw) {
  if (!tagRaw || typeof tagRaw !== "string") return null;
  const merchantTags = parseEmvTlv(tagRaw);
  const guid = String(merchantTags["00"] || "").trim().toUpperCase();
  const isNapasGuid = guid.includes("A000000727") || !guid;

  // Chuẩn NAPAS: sub-tag 01 chứa nested TLV { 00: BIN, 01: Account/Nickname }
  if (merchantTags["01"]) {
    const nested = parseEmvTlv(merchantTags["01"]);
    const bin = String(nested["00"] || "").replace(/\D/g, "");
    const acct = sanitizeAccountOrNickname(nested["01"] || "");
    if (/^\d{6}$/.test(bin) && acct.length >= 3) {
      return { bin, acct, priority: guid.includes("A000000727") ? 2 : 1 };
    }
  }

  // Fallback một số QR nội địa đặt thẳng BIN ở 00 và STK/Nickname ở 01 nếu isNapasGuid
  if (isNapasGuid) {
    const directBin = String(merchantTags["00"] || "").replace(/\D/g, "");
    const directAcct = sanitizeAccountOrNickname(merchantTags["01"] || "");
    if (/^\d{6}$/.test(directBin) && directAcct.length >= 3) {
      return { bin: directBin, acct: directAcct, priority: 0 };
    }
  }
  return null;
}

/**
 * Phân tích chuỗi VietQR / NAPAS EMVCo (`000201...`):
 * - Hỗ trợ giữ nguyên cả STK số lẫn Nickname chữ + số (VD: ANNGUYEN88, SHOPVIP88)
 * - Đọc độc lập Tag 59 (Tên chủ thẻ); bỏ qua "NA", "VIETQR"... và KHÔNG tự lấy tên nhân viên đè vào
 */
export function parseVietQrPayload(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return { recognized: false, reason: "Mã QR trống." };
  }

  if (text.startsWith("0002")) {
    const rootTags = parseEmvTlv(text);
    // Quét Tag 38 đầu tiên, sau đó toàn bộ Tag 26 -> 51 theo chuẩn EMVCo Merchant Account Info
    const candidateTagKeys = ["38"];
    for (let t = 26; t <= 51; t++) {
      const k = String(t).padStart(2, "0");
      if (k !== "38") candidateTagKeys.push(k);
    }

    let bestMatch = null;
    for (const key of candidateTagKeys) {
      if (!rootTags[key]) continue;
      const extracted = extractBeneficiaryFromMerchantTag(rootTags[key]);
      if (extracted && (!bestMatch || extracted.priority > bestMatch.priority)) {
        bestMatch = extracted;
        if (extracted.priority >= 2) break;
      }
    }

    if (bestMatch) {
      const matchedBank = findBankByCodeOrBin(bestMatch.bin);
      const rawHolder = rootTags["59"] || "";
      const hasHolderName = isMeaningfulHolderName(rawHolder);
      return {
        recognized: true,
        raw: text,
        bank_bin: bestMatch.bin,
        bank_code: matchedBank ? matchedBank.code : bestMatch.bin,
        bank_name: matchedBank ? matchedBank.shortName : `Ngân hàng (BIN ${bestMatch.bin})`,
        bank_account_number: bestMatch.acct,
        bank_account_name: hasHolderName ? toUpperUnaccentedName(rawHolder) : "",
        has_holder_name: hasHolderName
      };
    }
  }

  return {
    recognized: false,
    raw: text,
    reason: "Không tìm thấy thông tin ngân hàng chuẩn VietQR/NAPAS trong mã QR này."
  };
}

/**
 * Giải mã ảnh QR hoàn toàn trên HTML5 Canvas với 2 lượt (trực tiếp + grayscale boost tương phản),
 * rồi xóa sạch dữ liệu Canvas & Blob URL ngay trong khối finally.
 */
export async function decodeBankQrFromImageFile(file) {
  if (!file) {
    throw new Error("Vui lòng chọn một tệp ảnh mã QR.");
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Tệp đã chọn không phải là hình ảnh hợp lệ.");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Ảnh quá lớn (vượt quá 15MB). Vui lòng chọn ảnh QR nhẹ hơn.");
  }

  const objectUrl = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  let ctx = null;
  let img = null;

  try {
    img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Không thể đọc tệp ảnh đã chọn."));
      image.src = objectUrl;
    });

    const natW = img.naturalWidth || img.width || 0;
    const natH = img.naturalHeight || img.height || 0;
    if (!natW || !natH) {
      throw new Error("Kích thước ảnh không hợp lệ.");
    }

    ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Trình duyệt không hỗ trợ bộ giải mã ảnh Canvas.");
    }

    const scale = Math.min(1, 1200 / Math.max(natW, natH));
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Lượt 1: Quét trực tiếp ảnh chuẩn hóa kích thước (<= 1200px)
    const pass1Data = ctx.getImageData(0, 0, w, h);
    let decodedQr = jsQR(pass1Data.data, w, h, { inversionAttempts: "attemptBoth" });

    // Lượt 2: Nếu Lượt 1 thất bại -> Grayscale + Contrast Boost cho ảnh nền màu / chụp màn hình mờ
    if (!decodedQr || !decodedQr.data) {
      const d = pass1Data.data;
      const contrast = 1.9;
      for (let idx = 0; idx < d.length; idx += 4) {
        const lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        const boosted = Math.max(0, Math.min(255, Math.round((lum - 128) * contrast + 128)));
        const v = boosted > 132 ? 255 : 0;
        d[idx] = v;
        d[idx + 1] = v;
        d[idx + 2] = v;
      }
      decodedQr = jsQR(d, w, h, { inversionAttempts: "attemptBoth" });
    }

    if (!decodedQr || !decodedQr.data) {
      return {
        recognized: false,
        reason: "Không nhận diện được mã QR trong ảnh này. Vui lòng chọn ảnh rõ nét hơn hoặc nhập thủ công."
      };
    }

    return parseVietQrPayload(decodedQr.data);
  } finally {
    // Xóa sạch ảnh khỏi bộ nhớ ngay lập tức
    try {
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.width = 0;
      canvas.height = 0;
    } catch {}
    try {
      if (img) {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
    } catch {}
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {}
  }
}
