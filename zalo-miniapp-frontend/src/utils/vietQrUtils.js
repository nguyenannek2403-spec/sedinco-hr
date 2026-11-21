import jsQR from "jsqr";
import QRCode from "qrcode";

/**
 * Danh sách ngân hàng Việt Nam theo chuẩn mã BIN NAPAS / VietQR.
 */
export const VIETNAM_BANKS = [
  { code: "VCB", bin: "970436", shortName: "Vietcombank", name: "Vietcombank — TMCP Ngoại thương Việt Nam" },
  { code: "BIDV", bin: "970418", shortName: "BIDV", name: "BIDV — TMCP Đầu tư & Phát triển Việt Nam" },
  { code: "CTG", bin: "970415", shortName: "VietinBank", name: "VietinBank — TMCP Công thương Việt Nam" },
  { code: "VBA", bin: "970405", shortName: "Agribank", name: "Agribank — NN & PTNT Việt Nam" },
  { code: "TCB", bin: "970407", shortName: "Techcombank", name: "Techcombank — TMCP Kỹ thương Việt Nam" },
  { code: "MB", bin: "970422", shortName: "MBBank", name: "MBBank — TMCP Quân đội" },
  { code: "ACB", bin: "970416", shortName: "ACB", name: "ACB — TMCP Á Châu" },
  { code: "VPB", bin: "970432", shortName: "VPBank", name: "VPBank — TMCP Việt Nam Thịnh Vượng" },
  { code: "TPB", bin: "970423", shortName: "TPBank", name: "TPBank — TMCP Tiên Phong" },
  { code: "STB", bin: "970403", shortName: "Sacombank", name: "Sacombank — TMCP Sài Gòn Thương Tín" },
  { code: "HDB", bin: "970437", shortName: "HDBank", name: "HDBank — TMCP Phát triển TP.HCM" },
  { code: "VIB", bin: "970441", shortName: "VIB", name: "VIB — TMCP Quốc tế Việt Nam" },
  { code: "SHB", bin: "970443", shortName: "SHB", name: "SHB — TMCP Sài Gòn - Hà Nội" },
  { code: "OCB", bin: "970448", shortName: "OCB", name: "OCB — TMCP Phương Đông" },
  { code: "MSB", bin: "970426", shortName: "MSB", name: "MSB — TMCP Hàng Hải Việt Nam" },
  { code: "EIB", bin: "970431", shortName: "Eximbank", name: "Eximbank — TMCP Xuất Nhập Khẩu Việt Nam" },
  { code: "SEAB", bin: "970440", shortName: "SeABank", name: "SeABank — TMCP Đông Nam Á" },
  { code: "LPB", bin: "970449", shortName: "LPBank", name: "LPBank — TMCP Lộc Phát Việt Nam" },
  { code: "NAB", bin: "970428", shortName: "Nam A Bank", name: "Nam A Bank — TMCP Nam Á" },
  { code: "SCB", bin: "970429", shortName: "SCB", name: "SCB — TMCP Sài Gòn" },
  { code: "BAB", bin: "970409", shortName: "Bac A Bank", name: "Bac A Bank — TMCP Bắc Á" },
  { code: "ABB", bin: "970425", shortName: "ABBANK", name: "ABBANK — TMCP An Bình" },
  { code: "VCCB", bin: "970454", shortName: "BVBank", name: "BVBank — TMCP Bản Việt" },
  { code: "NVB", bin: "970419", shortName: "NCB", name: "NCB — TMCP Quốc Dân" },
  { code: "PGB", bin: "970430", shortName: "PGBank", name: "PGBank — TMCP Thịnh Vượng & Phát triển" },
  { code: "VAB", bin: "970427", shortName: "VietABank", name: "VietABank — TMCP Việt Á" },
  { code: "CAKE", bin: "546034", shortName: "CAKE", name: "CAKE by VPBank" },
  { code: "UBANK", bin: "546035", shortName: "Ubank", name: "Ubank by VPBank" },
  { code: "TIMO", bin: "963388", shortName: "Timo", name: "Timo Digital Bank (BVBank)" },
  { code: "SHBVN", bin: "970424", shortName: "Shinhan Bank", name: "Shinhan Bank Việt Nam" },
  { code: "WVN", bin: "970457", shortName: "Woori Bank", name: "Woori Bank Việt Nam" },
  { code: "HSBC", bin: "458761", shortName: "HSBC", name: "HSBC Việt Nam" }
];

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

export function findBankByCodeOrBin(codeOrBin) {
  const clean = String(codeOrBin || "").trim().toUpperCase();
  if (!clean) return null;
  return (
    VIETNAM_BANKS.find(
      (b) => b.code.toUpperCase() === clean || b.bin === clean || b.shortName.toUpperCase() === clean
    ) || null
  );
}

/**
 * Parse chuỗi EMVCo TLV (tag 2 ký tự + len 2 ký tự + value).
 */
export function parseEmvTlv(str) {
  const out = {};
  if (!str || typeof str !== "string") return out;
  let i = 0;
  while (i + 4 <= str.length) {
    const tag = str.slice(i, i + 2);
    const lenStr = str.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) break;
    const len = parseInt(lenStr, 10);
    const valStart = i + 4;
    if (valStart + len > str.length) break;
    out[tag] = str.slice(valStart, valStart + len);
    i = valStart + len;
  }
  return out;
}

/**
 * Giải mã payload chuỗi QR chuẩn NAPAS VietQR (EMVCo TLV tag 38).
 */
export function parseVietQrPayload(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return { recognized: false, reason: "Mã QR trống." };
  }

  // Trường hợp EMVCo chuẩn bắt đầu bằng 000201
  if (text.startsWith("0002")) {
    const rootTags = parseEmvTlv(text);
    const candidateTagKeys = ["38", "39", "26", "27", "28", "29", "30", "31"];
    for (const key of candidateTagKeys) {
      if (!rootTags[key]) continue;
      const merchantTags = parseEmvTlv(rootTags[key]);
      const beneficiaryRaw = merchantTags["01"];
      if (!beneficiaryRaw) continue;
      const benTags = parseEmvTlv(beneficiaryRaw);
      const bin = String(benTags["00"] || "").replace(/\D/g, "");
      const acct = String(benTags["01"] || "").replace(/\s+/g, "").trim();
      if (bin && acct) {
        const matchedBank = findBankByCodeOrBin(bin);
        const merchantNameRaw = rootTags["59"] && rootTags["59"] !== "NA" ? rootTags["59"] : "";
        return {
          recognized: true,
          raw: text,
          bank_bin: bin,
          bank_code: matchedBank ? matchedBank.code : bin,
          bank_name: matchedBank ? matchedBank.shortName : `Ngân hàng (BIN ${bin})`,
          bank_account_number: acct.replace(/[^0-9A-Za-z]/g, ""),
          bank_account_name: merchantNameRaw ? toUpperUnaccentedName(merchantNameRaw) : ""
        };
      }
    }
  }

  return {
    recognized: false,
    raw: text,
    reason: "Không tìm thấy thông tin tài khoản VietQR/NAPAS hợp lệ trong mã QR."
  };
}

/**
 * Đọc ảnh QR bằng HTML5 Canvas + jsQR hoàn toàn ở phía trình duyệt,
 * tự động thử nhiều tỷ lệ & tăng tương phản rồi dọn sạch mọi dữ liệu ảnh khỏi RAM/DOM.
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

    const maxDims = [Math.min(1200, Math.max(natW, natH)), 900, 600, 420];
    const uniqueMaxDims = [...new Set(maxDims.filter((d) => d >= 200))];

    let decodedQr = null;
    for (const targetMax of uniqueMaxDims) {
      const scale = Math.min(1, targetMax / Math.max(natW, natH));
      const w = Math.max(1, Math.round(natW * scale));
      const h = Math.max(1, Math.round(natH * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      decodedQr = jsQR(imgData.data, w, h, { inversionAttempts: "attemptBoth" });
      if (decodedQr && decodedQr.data) break;

      // Pass tăng tương phản đen trắng nhẹ cho ảnh chụp màn hình mờ
      const d = imgData.data;
      for (let idx = 0; idx < d.length; idx += 4) {
        const lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        const v = lum > 140 ? 255 : 0;
        d[idx] = v;
        d[idx + 1] = v;
        d[idx + 2] = v;
      }
      decodedQr = jsQR(d, w, h, { inversionAttempts: "attemptBoth" });
      if (decodedQr && decodedQr.data) break;
    }

    if (!decodedQr || !decodedQr.data) {
      return {
        recognized: false,
        reason: "Không nhận diện được mã QR trong ảnh này. Vui lòng thử ảnh rõ nét hơn hoặc nhập thủ công."
      };
    }

    return parseVietQrPayload(decodedQr.data);
  } finally {
    // Tuyệt đối xóa sạch dữ liệu ảnh QR tạm trên Canvas & Blob URL ngay lập tức
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

function formatTlvSegment(tag, value) {
  const valStr = String(value || "");
  const lenStr = String(valStr.length).padStart(2, "0");
  return `${tag}${lenStr}${valStr}`;
}

function crc16Ccitt(asciiStr) {
  let crc = 0xffff;
  for (let i = 0; i < asciiStr.length; i++) {
    crc ^= asciiStr.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Tạo chuỗi chuẩn NAPAS VietQR EMVCo có thể quét được bởi mọi app ngân hàng Việt Nam (Offline).
 */
export function buildVietQrPayload({ bankCodeOrBin, accountNumber, amount = 0, description = "" }) {
  const bankInfo = findBankByCodeOrBin(bankCodeOrBin);
  const bin = bankInfo ? bankInfo.bin : String(bankCodeOrBin || "").replace(/\D/g, "");
  const cleanAcct = String(accountNumber || "").replace(/\s+/g, "");
  if (!bin || !cleanAcct) return "";

  const cleanAmount = Math.max(0, Math.round(Number(amount) || 0));
  const cleanDesc = toUpperUnaccentedName(description).slice(0, 75);

  const benValue = formatTlvSegment("00", bin) + formatTlvSegment("01", cleanAcct);
  const merchantAccInfo =
    formatTlvSegment("00", "A000000727") +
    formatTlvSegment("01", benValue) +
    formatTlvSegment("02", "QRIBFTTA");

  const parts = [
    formatTlvSegment("00", "01"),
    formatTlvSegment("01", cleanAmount > 0 ? "12" : "11"),
    formatTlvSegment("38", merchantAccInfo),
    formatTlvSegment("53", "704")
  ];

  if (cleanAmount > 0) {
    parts.push(formatTlvSegment("54", String(cleanAmount)));
  }
  parts.push(formatTlvSegment("58", "VN"));
  if (cleanDesc) {
    parts.push(formatTlvSegment("62", formatTlvSegment("08", cleanDesc)));
  }

  const bodyWithCrcPrefix = `${parts.join("")}6304`;
  return `${bodyWithCrcPrefix}${crc16Ccitt(bodyWithCrcPrefix)}`;
}

/**
 * Sinh Data URL QR Code hoàn toàn offline bằng thư viện qrcode.
 */
export async function generateVietQrDataUrl(params) {
  const payload = buildVietQrPayload(params);
  if (!payload) return "";
  return QRCode.toDataURL(payload, {
    width: 260,
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0F172A",
      light: "#FFFFFF"
    }
  });
}
