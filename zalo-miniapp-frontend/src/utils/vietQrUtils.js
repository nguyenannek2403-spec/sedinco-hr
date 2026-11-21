import QRCode from "qrcode";
import { VIETNAM_BANKS, findBankByCodeOrBin, getBankLogoUrl } from "./vietnamBanks.js";
import {
  parseEmvTlv,
  parseVietQrPayload,
  toUpperUnaccentedName,
  isMeaningfulHolderName,
  decodeBankQrFromImageFile
} from "./vietqrParser.js";

export {
  VIETNAM_BANKS,
  findBankByCodeOrBin,
  getBankLogoUrl,
  parseEmvTlv,
  parseVietQrPayload,
  toUpperUnaccentedName,
  isMeaningfulHolderName,
  decodeBankQrFromImageFile
};

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
 * Tạo chuỗi chuẩn NAPAS VietQR EMVCo quét được bởi mọi app ngân hàng Việt Nam (hỗ trợ cả STK số & Nickname chữ + số).
 */
export function buildVietQrPayload({ bankCodeOrBin, accountNumber, amount = 0, description = "" }) {
  const bankInfo = findBankByCodeOrBin(bankCodeOrBin);
  const bin = bankInfo ? bankInfo.bin : String(bankCodeOrBin || "").replace(/\D/g, "");
  const cleanAcct = String(accountNumber || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "");
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
 * Tạo URL chuẩn VietQR QuickLink (được encodeURIComponent an toàn cho cả nickname chữ + số).
 */
export function buildVietQrQuickLinkUrl({
  bankCodeOrBin,
  accountNumber,
  accountName = "",
  amount = 0,
  description = ""
}) {
  const bankInfo = findBankByCodeOrBin(bankCodeOrBin);
  const bin = bankInfo ? bankInfo.bin : String(bankCodeOrBin || "").replace(/\D/g, "");
  const cleanAcct = String(accountNumber || "").replace(/\s+/g, "").trim();
  if (!bin || !cleanAcct) return "";

  const cleanAmount = Math.max(0, Math.round(Number(amount) || 0));
  const params = new URLSearchParams();
  if (cleanAmount > 0) params.set("amount", String(cleanAmount));
  if (description) params.set("addInfo", toUpperUnaccentedName(description).slice(0, 75));
  if (accountName) params.set("accountName", toUpperUnaccentedName(accountName));
  const query = params.toString();
  return `https://img.vietqr.io/image/${bin}-${encodeURIComponent(cleanAcct)}-compact2.png${
    query ? `?${query}` : ""
  }`;
}

/**
 * Danh sách ứng dụng Ngân hàng hỗ trợ VietQR Deep Link (dl.vietqr.io/pay?app=...).
 */
export const SENDER_BANK_APPS = [
  { appId: "vcb", bankCode: "VCB", label: "Vietcombank (VCB Digibank)" },
  { appId: "mb", bankCode: "MB", label: "MB Bank" },
  { appId: "tcb", bankCode: "TCB", label: "Techcombank Mobile" },
  { appId: "bidv", bankCode: "BIDV", label: "BIDV SmartBanking" },
  { appId: "icb", bankCode: "ICB", label: "VietinBank iPay" },
  { appId: "vba", bankCode: "VBA", label: "Agribank Plus" },
  { appId: "acb", bankCode: "ACB", label: "ACB ONE" },
  { appId: "vpb", bankCode: "VPB", label: "VPBank NEO" },
  { appId: "tpb", bankCode: "TPB", label: "TPBank Mobile" },
  { appId: "stb", bankCode: "STB", label: "Sacombank Pay" },
  { appId: "hdb", bankCode: "HDB", label: "HDBank" },
  { appId: "vib", bankCode: "VIB", label: "MyVIB" },
  { appId: "shb", bankCode: "SHB", label: "SHB Mobile" },
  { appId: "ocb", bankCode: "OCB", label: "OCB OMNI" },
  { appId: "msb", bankCode: "MSB", label: "MSB mBank" },
  { appId: "timo", bankCode: "TIMO", label: "Timo Digital Bank" },
  { appId: "cake", bankCode: "CAKE", label: "CAKE by VPBank" }
];

/**
 * Sinh Deep Link chuẩn VietQR (https://dl.vietqr.io/pay?app=...&ba=...&am=...&tn=...&bn=...)
 * để tự động mở ứng dụng Ngân hàng trên điện thoại và điền sẵn toàn bộ thông tin chuyển khoản.
 */
export function buildVietQrBankDeepLink({
  appId = "vcb",
  bankCodeOrBin,
  accountNumber,
  amount = 0,
  description = "",
  accountName = ""
}) {
  const bankInfo = findBankByCodeOrBin(bankCodeOrBin);
  const bin = bankInfo ? bankInfo.bin : String(bankCodeOrBin || "").replace(/\D/g, "");
  const cleanAcct = String(accountNumber || "").replace(/\s+/g, "").trim();
  if (!bin || !cleanAcct) return "";

  const cleanApp = String(appId || "vcb").trim().toLowerCase();
  const cleanAmount = Math.max(0, Math.round(Number(amount) || 0));
  const cleanNote = toUpperUnaccentedName(description).slice(0, 75);
  const cleanHolder = toUpperUnaccentedName(accountName);

  const pairs = [
    `app=${encodeURIComponent(cleanApp)}`,
    `ba=${encodeURIComponent(cleanAcct)}@${bin}`,
    `am=${cleanAmount}`,
    `tn=${encodeURIComponent(cleanNote)}`,
    `bn=${encodeURIComponent(cleanHolder)}`
  ];
  return `https://dl.vietqr.io/pay?${pairs.join("&")}`;
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
