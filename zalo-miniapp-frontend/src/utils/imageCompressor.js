/**
 * Tiện ích nén ảnh đại diện phía trình duyệt (V43):
 * - Cắt vuông trung tâm (center-crop 1:1) & thu nhỏ về 160x160 px
 * - Nén chuẩn image/webp (fallback image/jpeg nếu trình duyệt không hỗ trợ)
 * - Tự động hạ chất lượng từ 0.75 -> 0.55 nếu Data URL vượt > 25.000 ký tự để luôn giữ ~5-15 KB
 * - Xóa sạch Canvas & giải phóng Blob URL ngay trong khối finally
 */

const AVATAR_SIZE_PX = 160;
const PRIMARY_QUALITY = 0.75;
const FALLBACK_QUALITY = 0.55;
const TARGET_MAX_CHARS = 25000;

function encodeAvatarCanvas(canvas, mime, quality) {
  let out = canvas.toDataURL(mime, quality);
  // Nếu trình duyệt cũ trả fallback image/png thay vì webp, chuyển sang image/jpeg nhẹ hơn
  if (mime === "image/webp" && !out.startsWith("data:image/webp")) {
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

export async function compressAvatarImage(file) {
  if (!file) {
    throw new Error("Vui lòng chọn một tệp hình ảnh.");
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Tệp đã chọn không phải là hình ảnh hợp lệ.");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Ảnh gốc quá lớn (vượt quá 20MB). Vui lòng chọn ảnh khác.");
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

    // Center-crop 1:1 tránh méo hình
    const cropSize = Math.min(natW, natH);
    const sx = Math.max(0, Math.floor((natW - cropSize) / 2));
    const sy = Math.max(0, Math.floor((natH - cropSize) / 2));

    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Trình duyệt không hỗ trợ xử lý ảnh Canvas.");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      sx,
      sy,
      cropSize,
      cropSize,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX
    );

    let dataUrl = encodeAvatarCanvas(canvas, "image/webp", PRIMARY_QUALITY);
    if (dataUrl.length > TARGET_MAX_CHARS) {
      const activeMime = dataUrl.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
      dataUrl = encodeAvatarCanvas(canvas, activeMime, FALLBACK_QUALITY);
    }

    return {
      dataUrl,
      width: AVATAR_SIZE_PX,
      height: AVATAR_SIZE_PX,
      charLength: dataUrl.length
    };
  } finally {
    try {
      if (ctx) {
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
