/**
 * src/utils/imageHelper.js
 * Tiện ích nén và đổi cỡ ảnh phía Client bằng Canvas (JPEG/WebP).
 */

export async function compressAndResizeImage(imageSrc, maxWidth = 480, maxHeight = 480, quality = 0.6) {
  return new Promise((resolve, reject) => {
    if (!imageSrc) {
      return reject(new Error("Không có dữ liệu ảnh để nén"));
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(imageSrc);
        }

        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl;
        try {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        } catch (e) {
          dataUrl = imageSrc;
        }

        resolve(dataUrl);
      } catch (err) {
        console.warn("Lỗi nén ảnh qua canvas:", err);
        resolve(imageSrc);
      }
    };

    img.onerror = (err) => {
      console.warn("Lỗi tải ảnh vào Image element:", err);
      resolve(imageSrc);
    };

    img.src = imageSrc;
  });
}
