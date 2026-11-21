/**
 * Danh mục ngân hàng Việt Nam theo chuẩn mã BIN NAPAS / VietQR.
 * Mỗi ngân hàng có `bin` (6 chữ số), `code` (trùng ảnh logo VietQR), `shortName`, `fullName`, `brandColor` & `aliases`.
 */
export const VIETNAM_BANKS = [
  { bin: "970436", code: "VCB", shortName: "Vietcombank", fullName: "Ngân hàng TMCP Ngoại thương Việt Nam", brandColor: "#006B3E", aliases: ["VCB", "VIETCOM"] },
  { bin: "970422", code: "MB", shortName: "MBBank", fullName: "Ngân hàng TMCP Quân đội", brandColor: "#141ED2", aliases: ["MB", "MBB", "MBBANK"] },
  { bin: "970407", code: "TCB", shortName: "Techcombank", fullName: "Ngân hàng TMCP Kỹ thương Việt Nam", brandColor: "#EE0033", aliases: ["TCB", "TECH", "TECHCOM"] },
  { bin: "970418", code: "BIDV", shortName: "BIDV", fullName: "Ngân hàng TMCP Đầu tư & Phát triển Việt Nam", brandColor: "#00529B", aliases: ["BIDV", "BID"] },
  { bin: "970415", code: "ICB", shortName: "VietinBank", fullName: "Ngân hàng TMCP Công thương Việt Nam", brandColor: "#0071BC", aliases: ["ICB", "CTG", "VIETIN", "VIETINBANK"] },
  { bin: "970405", code: "VBA", shortName: "Agribank", fullName: "Ngân hàng Nông nghiệp & Phát triển Nông thôn VN", brandColor: "#AE1C3F", aliases: ["VBA", "AGR", "AGRIBANK"] },
  { bin: "970416", code: "ACB", shortName: "ACB", fullName: "Ngân hàng TMCP Á Châu", brandColor: "#0066B3", aliases: ["ACB", "ACHAU"] },
  { bin: "970432", code: "VPB", shortName: "VPBank", fullName: "Ngân hàng TMCP Việt Nam Thịnh Vượng", brandColor: "#009F4D", aliases: ["VPB", "VPBANK"] },
  { bin: "970423", code: "TPB", shortName: "TPBank", fullName: "Ngân hàng TMCP Tiên Phong", brandColor: "#5D2B90", aliases: ["TPB", "TPBANK", "TIENPHONG"] },
  { bin: "970403", code: "STB", shortName: "Sacombank", fullName: "Ngân hàng TMCP Sài Gòn Thương Tín", brandColor: "#005CA9", aliases: ["STB", "SACOM", "SACOMBANK"] },
  { bin: "970437", code: "HDB", shortName: "HDBank", fullName: "Ngân hàng TMCP Phát triển TP.HCM", brandColor: "#E11B22", aliases: ["HDB", "HDBANK"] },
  { bin: "970441", code: "VIB", shortName: "VIB", fullName: "Ngân hàng TMCP Quốc tế Việt Nam", brandColor: "#005BA8", aliases: ["VIB"] },
  { bin: "970443", code: "SHB", shortName: "SHB", fullName: "Ngân hàng TMCP Sài Gòn - Hà Nội", brandColor: "#F37021", aliases: ["SHB"] },
  { bin: "970448", code: "OCB", shortName: "OCB", fullName: "Ngân hàng TMCP Phương Đông", brandColor: "#008C45", aliases: ["OCB"] },
  { bin: "970426", code: "MSB", shortName: "MSB", fullName: "Ngân hàng TMCP Hàng Hải Việt Nam", brandColor: "#E65024", aliases: ["MSB", "MARITIME"] },
  { bin: "970440", code: "SEAB", shortName: "SeABank", fullName: "Ngân hàng TMCP Đông Nam Á", brandColor: "#C8102E", aliases: ["SEAB", "SEABANK"] },
  { bin: "970431", code: "EIB", shortName: "Eximbank", fullName: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam", brandColor: "#0082C8", aliases: ["EIB", "EXIM", "EXIMBANK"] },
  { bin: "970449", code: "LPB", shortName: "LPBank", fullName: "Ngân hàng TMCP Lộc Phát Việt Nam", brandColor: "#9E5718", aliases: ["LPB", "LIENVIET", "LPBANK"] },
  { bin: "970454", code: "VCCB", shortName: "BVBank", fullName: "Ngân hàng TMCP Bản Việt", brandColor: "#1D428A", aliases: ["BVB", "VCCB", "BVBANK", "BANVIET"] },
  { bin: "970428", code: "NAB", shortName: "Nam A Bank", fullName: "Ngân hàng TMCP Nam Á", brandColor: "#1B5BA7", aliases: ["NAB", "NAMABANK", "NAMA"] },
  { bin: "970425", code: "ABB", shortName: "ABBANK", fullName: "Ngân hàng TMCP An Bình", brandColor: "#00A19C", aliases: ["ABB", "ABBANK", "ANBINH"] },
  { bin: "970412", code: "PVCB", shortName: "PVcomBank", fullName: "Ngân hàng TMCP Đại Chúng Việt Nam", brandColor: "#005BAB", aliases: ["PVCB", "PVCOMBANK"] },
  { bin: "970419", code: "NCB", shortName: "NCB", fullName: "Ngân hàng TMCP Quốc Dân", brandColor: "#C8102E", aliases: ["NCB", "NVB"] },
  { bin: "970424", code: "SHBVN", shortName: "Shinhan Bank", fullName: "Ngân hàng TNHH MTV Shinhan Việt Nam", brandColor: "#0046FF", aliases: ["SHBVN", "SHINHAN"] },
  { bin: "970452", code: "KLB", shortName: "KienlongBank", fullName: "Ngân hàng TMCP Kiên Long", brandColor: "#0072BC", aliases: ["KLB", "KIENLONG", "KIENLONGBANK"] },
  { bin: "970409", code: "BAB", shortName: "Bac A Bank", fullName: "Ngân hàng TMCP Bắc Á", brandColor: "#E1251B", aliases: ["BAB", "BACABANK", "BACA"] },
  { bin: "970430", code: "PGB", shortName: "PGBank", fullName: "Ngân hàng TMCP Thịnh Vượng & Phát triển", brandColor: "#0054A6", aliases: ["PGB", "PGBANK"] },
  { bin: "970427", code: "VAB", shortName: "VietABank", fullName: "Ngân hàng TMCP Việt Á", brandColor: "#E30613", aliases: ["VAB", "VIETABANK"] },
  { bin: "970429", code: "SCB", shortName: "SCB", fullName: "Ngân hàng TMCP Sài Gòn", brandColor: "#005A9C", aliases: ["SCB"] },
  { bin: "963388", code: "TIMO", shortName: "Timo", fullName: "Ngân hàng số Timo by BVBank", brandColor: "#4834D4", aliases: ["TIMO"] },
  { bin: "546034", code: "CAKE", shortName: "CAKE", fullName: "Ngân hàng số CAKE by VPBank", brandColor: "#EC008C", aliases: ["CAKE"] },
  { bin: "546035", code: "UBANK", shortName: "Ubank", fullName: "Ngân hàng số Ubank by VPBank", brandColor: "#FF6B00", aliases: ["UBANK"] },
  { bin: "970457", code: "WVN", shortName: "Woori Bank", fullName: "Ngân hàng TNHH MTV Woori Việt Nam", brandColor: "#0067AC", aliases: ["WVN", "WOORI"] },
  { bin: "458761", code: "HSBC", shortName: "HSBC", fullName: "Ngân hàng TNHH MTV HSBC Việt Nam", brandColor: "#DB0011", aliases: ["HSBC"] }
];

export function getBankLogoUrl(bank) {
  if (!bank) return "";
  const code = String(bank.logoCode || bank.code || "").trim().toUpperCase();
  return code ? `https://api.vietqr.io/img/${code}.png` : "";
}

export function findBankByCodeOrBin(codeOrBin) {
  const clean = String(codeOrBin || "").trim().toUpperCase();
  if (!clean) return null;
  return (
    VIETNAM_BANKS.find(
      (b) =>
        b.bin === clean ||
        b.code.toUpperCase() === clean ||
        b.shortName.toUpperCase() === clean ||
        (Array.isArray(b.aliases) && b.aliases.some((a) => a.toUpperCase() === clean))
    ) || null
  );
}
