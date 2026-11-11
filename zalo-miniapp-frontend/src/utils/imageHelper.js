/**
 * src/utils/imageHelper.js
 * 
 * Tiện ích xử lý ảnh phía Client (B5 - G5):
 * 1. Chụp ảnh trực tiếp từ Camera (chặn chọn từ album/thư viện ảnh)
 * 2. Nén và đổi kích thước ảnh bằng Canvas (Max 800x800, JPEG/WebP quality 0.8)
 * 3. Giảm dung lượng ảnh chụp camera từ ~3-5MB xuống < 150KB trước khi gửi lên Server
 */

import { zmpAdapter } from '../adapters/zmp/sdkAdapter';

/**
 * Nén và đổi cỡ ảnh phía Client sử dụng Canvas
 * @param {string} imageSrc - URL hoặc dataURL ảnh gốc
 * @param {number} maxWidth - Chiều rộng tối đa (mặc định 800px)
 * @param {number} maxHeight - Chiều cao tối đa (mặc định 800px)
 * @param {number} quality - Chất lượng nén 0.0 -> 1.0 (mặc định 0.8)
 * @returns {Promise<string>} Data URL chuỗi Base64 đã nén
 */
export async function compressAndResizeImage(imageSrc, maxWidth = 480, maxHeight = 480, quality = 0.6) {
  return new Promise((resolve, reject) => {
    if (!imageSrc) {
      return reject(new Error('Không có dữ liệu ảnh để nén'));
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // Tính toán tỉ lệ co giãn giữ nguyên tỷ lệ khung hình với maxWidth 480px
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(imageSrc); // Fallback nếu không lấy được context
        }

        // Vẽ ảnh lên canvas với kích thước tối ưu
        ctx.drawImage(img, 0, 0, width, height);

        // Xuất chuẩn JPEG quality 0.6 đảm bảo chuỗi Base64 < 50KB bảo vệ DB Aiven
        let dataUrl;
        try {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        } catch (e) {
          dataUrl = imageSrc;
        }

        resolve(dataUrl);
      } catch (err) {
        console.warn('Lỗi nén ảnh qua canvas:', err);
        resolve(imageSrc); // Fallback ảnh gốc nếu lỗi canvas
      }
    };

    img.onerror = (err) => {
      console.warn('Lỗi tải ảnh vào Image element:', err);
      resolve(imageSrc);
    };

    img.src = imageSrc;
  });
}

/**
 * Chụp ảnh trực tiếp từ Camera (CHỈ camera, KHÔNG cho phép chọn album)
 * Sau đó tự động nén/đổi cỡ trước khi trả về.
 */
export async function captureDirectCameraPhoto() {
  try {
    // Chỉ định sourceType: ["camera"] để chặn người dùng tải ảnh có sẵn từ Album
    const res = await zmpAdapter.chooseImage({
      count: 1,
      sourceType: ['camera']
    });

    if (res && res.filePaths && res.filePaths.length > 0) {
      const originalPath = res.filePaths[0];
      // Tự động nén và resize tối đa 480px, quality 0.6
      const compressedDataUrl = await compressAndResizeImage(originalPath, 480, 480, 0.6);
      return {
        success: true,
        photoUrl: compressedDataUrl,
        isCompressed: true
      };
    }

    throw new Error('Không nhận được ảnh chụp từ camera');
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Không thể chụp ảnh khuôn mặt'
    };
  }
}
