import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import apiClient, {
  safeGet,
  safePost,
  safeDelete,
  generateIdempotencyKey
} from "../utils/api";
import { compressAndResizeImage } from "../utils/imageHelper";
import {
  SDK_STATES,
  createServiceResult,
  isZaloMiniAppRuntime,
  withSdkTimeout,
  mapZaloSdkError
} from "./zalo-sdk-core";

/**
 * Zalo & Web Centralized Media Service:
 * - Điểm kết nối duy nhất giữa Frontend và Backend `/api/media/*` (Cloudinary Management System).
 * - Truyền tệp bằng `multipart/form-data` đúng chuẩn `fieldname="file"` (hỗ trợ cả Zalo Media Picker, ảnh, PDF và video ngắn).
 * - Không bao giờ giữ CLOUDINARY_API_SECRET hay gọi trực tiếp Cloudinary API bỏ qua Backend.
 */

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_DOC_MIME = new Set(["application/pdf"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_LOCAL_PICK_BYTES = 15 * 1024 * 1024;

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || "").split(",");
  if (parts.length < 2) throw new Error("Dữ liệu ảnh sau nén không hợp lệ.");
  const header = parts[0];
  const mimeMatch = header.match(/data:([^;]+);base64/i);
  const mime = mimeMatch ? mimeMatch[1] : "image/webp";
  const binary = atob(parts[1]);
  const len = binary.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

function readBrowserFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không thể đọc nội dung tệp đã chọn."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function resolveZaloPathToBlob(filePath) {
  if (!filePath) throw new Error("Không tìm thấy đường dẫn tệp.");
  if (String(filePath).startsWith("data:")) {
    return dataUrlToBlob(filePath);
  }
  const resp = await fetch(filePath);
  if (!resp.ok) {
    throw new Error("Không thể đọc dữ liệu ảnh từ thiết bị Zalo.");
  }
  return resp.blob();
}

export async function uploadMultipartFile(
  fileOrBlob,
  {
    filename = "upload.webp",
    category = "employee_attachment",
    referenceDate = "",
    targetEmployeeId = ""
  } = {}
) {
  const formData = new FormData();
  const resolvedName =
    (fileOrBlob && typeof fileOrBlob.name === "string" && fileOrBlob.name.trim()) ||
    filename;

  formData.append("category", category);
  if (referenceDate) formData.append("reference_date", referenceDate);
  if (targetEmployeeId) formData.append("target_employee_id", targetEmployeeId);
  formData.append("file", fileOrBlob, resolvedName);

  const res = await safePost("/media/upload", formData, {
    idempotencyKey: generateIdempotencyKey("media"),
    timeout: 30000
  });

  if (res?.success && res.data?.url) {
    return createServiceResult({
      state: SDK_STATES.SUCCESS,
      data: res.data,
      message:
        res.data.storage === "cloudinary"
          ? "Đã tải tệp lên Cloudinary an toàn."
          : "Đã xác thực và lưu tệp nén gọn an toàn."
    });
  }

  return createServiceResult({
    state: SDK_STATES.ERROR,
    errorCode: res?.code || "MEDIA_UPLOAD_FAILED",
    message: res?.message || "Không thể tải tệp lên máy chủ.",
    canRetry: true
  });
}

async function prepareImageAndUpload({
  rawSrc,
  originalName = "evidence.jpg",
  category = "employee_attachment",
  referenceDate = "",
  targetEmployeeId = "",
  maxWidth = 1080,
  maxHeight = 1080,
  quality = 0.78
}) {
  const compressedDataUrl = await compressAndResizeImage(rawSrc, maxWidth, maxHeight, quality);
  let targetDataUrl = compressedDataUrl;

  if (targetDataUrl.length > 210000) {
    targetDataUrl = await compressAndResizeImage(rawSrc, Math.min(720, maxWidth), Math.min(720, maxHeight), 0.6);
  }

  const blob = dataUrlToBlob(targetDataUrl);
  const ext = blob.type === "image/webp" ? "webp" : (blob.type === "image/png" ? "png" : "jpg");
  const baseName = String(originalName || "evidence").replace(/\.[^.]+$/, "");
  return uploadMultipartFile(blob, {
    filename: `${baseName}.${ext}`,
    category,
    referenceDate,
    targetEmployeeId
  });
}

export async function ensureMediaCameraPermission() {
  if (!isZaloMiniAppRuntime()) {
    return createServiceResult({ state: SDK_STATES.FALLBACK, data: { granted: true } });
  }
  try {
    const checkRes = await withSdkTimeout(() => zmpAdapter.checkCameraPermission(), 4000, "checkZaloCameraPermission");
    if (checkRes?.userAllow) {
      return createServiceResult({ state: SDK_STATES.SUCCESS, data: { granted: true } });
    }
    const reqRes = await withSdkTimeout(() => zmpAdapter.requestCameraPermission(), 10000, "requestCameraPermission");
    if (reqRes?.userAllow) {
      return createServiceResult({ state: SDK_STATES.SUCCESS, data: { granted: true } });
    }
    return createServiceResult({
      state: SDK_STATES.PERMISSION_DENIED,
      errorCode: "CAMERA_PERMISSION_DENIED",
      message: "Bạn chưa cấp quyền Camera (ID 87) trên Zalo để chụp ảnh minh chứng.",
      canRetry: true,
      canOpenSettings: true
    });
  } catch (err) {
    return createServiceResult(mapZaloSdkError(err, "Không thể xin quyền Camera."));
  }
}

export async function pickZaloMediaAndUpload({
  preferredSource = "album",
  category = "employee_attachment",
  referenceDate = "",
  targetEmployeeId = "",
  maxWidth = 1080,
  maxHeight = 1080,
  quality = 0.78
} = {}) {
  if (!isZaloMiniAppRuntime()) {
    return createServiceResult({
      state: SDK_STATES.FALLBACK,
      errorCode: "BROWSER_FILE_PICKER_REQUIRED",
      message: "Vui lòng chọn tệp từ trình duyệt."
    });
  }

  if (preferredSource === "camera") {
    const camPerm = await ensureMediaCameraPermission();
    if (!camPerm.ok && camPerm.state !== SDK_STATES.FALLBACK) {
      return camPerm;
    }
  }

  let selectedPath = "";
  let mediaPickerPendingApproval = false;

  try {
    const pickerRes = await withSdkTimeout(
      () =>
        zmpAdapter.openMediaPicker({
          type: preferredSource === "camera" ? "zcamera_photo" : "photo",
          maxItemSize: 10 * 1024 * 1024,
          maxSelectItem: 1
        }),
      25000,
      "openMediaPicker"
    );
    const items = Array.isArray(pickerRes?.data) ? pickerRes.data : [];
    if (items.length > 0) {
      selectedPath = String(items[0]?.path || items[0] || "").trim();
    }
  } catch (pickerErr) {
    const mapped = mapZaloSdkError(pickerErr);
    if (mapped.state === SDK_STATES.PERMISSION_DENIED) {
      return createServiceResult(mapped);
    }
    if (mapped.state === SDK_STATES.PENDING_ZALO_APPROVAL) {
      mediaPickerPendingApproval = true;
    }
  }

  if (!selectedPath) {
    try {
      const chooseRes = await withSdkTimeout(
        () =>
          zmpAdapter.chooseImage({
            count: 1,
            sourceType: [preferredSource === "camera" ? "camera" : "album"],
            cameraType: "back"
          }),
        25000,
        "chooseImage"
      );
      if (chooseRes?.filePaths?.length > 0) {
        selectedPath = String(chooseRes.filePaths[0] || "").trim();
      }
    } catch (chooseErr) {
      const mapped = mapZaloSdkError(chooseErr, "Không thể chọn hoặc chụp ảnh từ thiết bị.");
      if (mediaPickerPendingApproval && mapped.state === SDK_STATES.ERROR) {
        return createServiceResult({
          state: SDK_STATES.PENDING_ZALO_APPROVAL,
          errorCode: "MEDIA_PICKER_PENDING_ZALO_APPROVAL",
          message: "Zalo Media Picker (ID 94) đang chờ cấp quyền trên Zalo Mini App. Hãy thử chọn tệp qua trình duyệt hoặc thử lại.",
          canRetry: true
        });
      }
      return createServiceResult(mapped);
    }
  }

  if (!selectedPath) {
    return createServiceResult({
      state: SDK_STATES.FALLBACK,
      errorCode: "NO_FILE_SELECTED",
      message: "Bạn chưa chọn ảnh nào."
    });
  }

  try {
    try {
      return await prepareImageAndUpload({
        rawSrc: selectedPath,
        category,
        referenceDate,
        targetEmployeeId,
        maxWidth,
        maxHeight,
        quality
      });
    } catch {
      const blob = await resolveZaloPathToBlob(selectedPath);
      return await uploadMultipartFile(blob, {
        filename: "zalo_media.jpg",
        category,
        referenceDate,
        targetEmployeeId
      });
    }
  } catch (err) {
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: err?.data?.code || err?.status || "UPLOAD_FAILED",
      message: err?.message || "Tải ảnh minh chứng lên máy chủ thất bại.",
      canRetry: true
    });
  }
}

export async function uploadBrowserEvidenceFile(
  file,
  {
    category = "employee_attachment",
    referenceDate = "",
    targetEmployeeId = "",
    maxWidth = 1080,
    maxHeight = 1080,
    quality = 0.78,
    allowPdf = false,
    allowVideo = false
  } = {}
) {
  if (!file) {
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: "MISSING_FILE",
      message: "Vui lòng chọn một tệp hợp lệ."
    });
  }

  const mime = String(file.type || "").toLowerCase();
  const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  const isImage = ALLOWED_IMAGE_MIME.has(mime) || mime.startsWith("image/");
  const isPdf = (allowPdf && (ALLOWED_DOC_MIME.has(mime) || ext === "pdf"));
  const isVideo = (allowVideo && (ALLOWED_VIDEO_MIME.has(mime) || mime.startsWith("video/")));

  if (!isImage && !isPdf && !isVideo) {
    const allowedText = allowVideo
      ? "JPEG, PNG, WebP, PDF hoặc Video MP4/WebM"
      : allowPdf
        ? "JPEG, PNG, WebP hoặc PDF"
        : "JPEG, PNG hoặc WebP";
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: "UNSUPPORTED_MEDIA_TYPE",
      message: `Chỉ hỗ trợ định dạng ${allowedText}.`
    });
  }

  if (file.size === 0) {
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: "EMPTY_FILE",
      message: "Tệp được chọn bị rỗng (0 byte)."
    });
  }

  if (file.size > MAX_LOCAL_PICK_BYTES) {
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: "FILE_TOO_LARGE",
      message: "Dung lượng tệp vượt quá giới hạn tối đa 15MB."
    });
  }

  try {
    if (isPdf || isVideo) {
      return await uploadMultipartFile(file, {
        filename: file.name || (isPdf ? "document.pdf" : "evidence.mp4"),
        category,
        referenceDate,
        targetEmployeeId
      });
    }

    const rawDataUrl = await readBrowserFileAsDataUrl(file);
    return await prepareImageAndUpload({
      rawSrc: rawDataUrl,
      originalName: file.name || "evidence.jpg",
      category,
      referenceDate,
      targetEmployeeId,
      maxWidth,
      maxHeight,
      quality
    });
  } catch (err) {
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: err?.data?.code || err?.status || "UPLOAD_FAILED",
      message: err?.message || "Không thể xác thực và tải tệp lên máy chủ.",
      canRetry: true
    });
  }
}

export async function uploadAvatarFile(file, { targetEmployeeId = "" } = {}) {
  return uploadBrowserEvidenceFile(file, {
    category: "employee_avatar",
    targetEmployeeId,
    maxWidth: 360,
    maxHeight: 360,
    quality: 0.8
  });
}

/**
 * Tải nội dung tài nguyên riêng tư (/api/media/:uuid/access) có đính kèm JWT header
 * để trình duyệt/WebView render ảnh, PDF hoặc video an toàn mà không đưa token lên query URL.
 */
export async function fetchAuthorizedMediaBlobUrl(mediaRef) {
  if (!mediaRef || typeof mediaRef !== "string") return { url: "", mimeType: "", revoke: null };
  const trimmed = mediaRef.trim();
  if (!trimmed.startsWith("/api/media/")) {
    return { url: trimmed, mimeType: "", revoke: null };
  }

  const endpoint = trimmed.replace(/^\/api/, "");
  const res = await apiClient.get(endpoint, {
    responseType: "blob",
    timeout: 25000
  });
  const blob = res.data;
  const objectUrl = URL.createObjectURL(blob);
  return {
    url: objectUrl,
    mimeType: blob?.type || "",
    revoke: () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }
  };
}

export const getMediaConfig = () => safeGet("/media/config");
export const getEmployeeDocuments = (maNv) => safeGet(`/media/employee/${encodeURIComponent(maNv)}/documents`);
export const deleteMediaAsset = (assetUuid, reason = "MANUAL_DELETE") =>
  safeDelete(`/media/${encodeURIComponent(assetUuid)}`, { data: { reason } });
export const getAdminMediaDashboard = (params = {}) => safeGet("/media/admin/dashboard", params);
export const getAdminMediaAssets = (params = {}) => safeGet("/media/admin/assets", params);
export const syncAdminCloudinaryUsage = () =>
  safePost("/media/admin/sync-usage", {}, { idempotencyKey: generateIdempotencyKey("media_sync") });
export const cleanupAdminOrphanAssets = ({ dryRun = false, retentionHours = null } = {}) =>
  safePost(
    "/media/admin/cleanup-orphans",
    { dry_run: Boolean(dryRun), retention_hours: retentionHours },
    { idempotencyKey: generateIdempotencyKey("media_cleanup") }
  );

export const zaloMediaService = {
  ensureMediaCameraPermission,
  pickZaloMediaAndUpload,
  uploadBrowserEvidenceFile,
  uploadAvatarFile,
  uploadMultipartFile,
  fetchAuthorizedMediaBlobUrl,
  getMediaConfig,
  getEmployeeDocuments,
  deleteMediaAsset,
  getAdminMediaDashboard,
  getAdminMediaAssets,
  syncAdminCloudinaryUsage,
  cleanupAdminOrphanAssets
};

export default zaloMediaService;
