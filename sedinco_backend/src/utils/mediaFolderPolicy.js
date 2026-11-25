/**
 * Chính sách phân loại thư mục Cloudinary & quyền nghiệp vụ tập trung (Hosting-agnostic).
 * - Frontend KHÔNG được phép truyền folder, asset_folder, public_id, resource_type hay access_mode tùy ý.
 * - Đường dẫn thư mục & public_id tuyệt đối KHÔNG chứa PII (họ tên, số điện thoại, email).
 * - Không bao giờ gom tất cả tệp vào 1 thư mục hoặc tạo 1 thư mục riêng cho từng tệp.
 */

const crypto = require('crypto');
const { getCloudinaryCredentialsConfig, getUploadSecurityConfig } = require('../config/cloudinaryConfig');

const FORBIDDEN_CLIENT_OVERRIDE_FIELDS = [
    'folder',
    'asset_folder',
    'public_id',
    'public_id_prefix',
    'resource_type',
    'api_secret',
    'signature',
    'access_mode',
    'delivery_type',
    'cloud_name',
    'api_key'
];

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const DISPUTE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'];
const IMPORT_MIMES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
];

/**
 * Danh mục chuẩn cho mọi luồng nghiệp vụ upload trong Sedinco HR.
 * `essential: true` được ưu tiên khi dung lượng hệ thống chạm ngưỡng 95% (chỉ chặn các upload không thiết yếu như avatar).
 */
const CATEGORY_POLICIES = {
    employee_avatar: {
        canonical: 'employee_avatar',
        shortCode: 'avt',
        label: 'Ảnh đại diện nhân sự',
        basePath: 'employees/avatars',
        dateScoped: false,
        employeeScoped: false,
        accessLevel: 'public',
        essential: false,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: IMAGE_MIMES,
        maxBytesKey: 'maxImageSizeBytes',
        maxBytesCap: 5 * 1024 * 1024
    },
    employee_document: {
        canonical: 'employee_document',
        shortCode: 'edoc',
        label: 'Giấy tờ & Hồ sơ nhân viên',
        basePath: 'employees/documents',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin', 'accountant'],
        requiredAccountantPermission: 'employee_edit',
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    employee_attachment: {
        canonical: 'employee_attachment',
        shortCode: 'eatt',
        label: 'Tài liệu đính kèm hồ sơ nhân sự',
        basePath: 'employees/attachments',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: false,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin', 'accountant'],
        requiredAccountantPermission: 'employee_edit',
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    attendance_evidence: {
        canonical: 'attendance_evidence',
        shortCode: 'att',
        label: 'Minh chứng chấm công hiện trường',
        basePath: 'attendance/evidence',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin', 'accountant'],
        requiredAccountantPermission: 'attendance_edit',
        allowedMimes: IMAGE_MIMES,
        maxBytesKey: 'maxImageSizeBytes'
    },
    leave_evidence: {
        canonical: 'leave_evidence',
        shortCode: 'lv',
        label: 'Minh chứng đơn xin nghỉ',
        basePath: 'leave-requests/evidence',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    attendance_adjustment: {
        canonical: 'attendance_adjustment',
        shortCode: 'adj',
        label: 'Minh chứng điều chỉnh / bổ sung công',
        basePath: 'attendance-adjustments/evidence',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    overtime_evidence: {
        canonical: 'overtime_evidence',
        shortCode: 'ot',
        label: 'Minh chứng đăng ký tăng ca',
        basePath: 'overtime-requests/evidence',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    shift_change_evidence: {
        canonical: 'shift_change_evidence',
        shortCode: 'shf',
        label: 'Tài liệu đề nghị đổi ca',
        basePath: 'shift-change-requests/evidence',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    business_trip_document: {
        canonical: 'business_trip_document',
        shortCode: 'btp',
        label: 'Tài liệu & lịch trình công tác',
        basePath: 'business-trips/documents',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    company_branding: {
        canonical: 'company_branding',
        shortCode: 'logo',
        label: 'Logo & nhận diện công ty',
        basePath: 'company/branding',
        dateScoped: false,
        employeeScoped: false,
        accessLevel: 'public',
        essential: false,
        allowedRoles: ['admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: IMAGE_MIMES,
        maxBytesKey: 'maxImageSizeBytes',
        maxBytesCap: 5 * 1024 * 1024
    },
    company_announcement: {
        canonical: 'company_announcement',
        shortCode: 'ann',
        label: 'Tệp đính kèm thông báo / chính sách công ty',
        basePath: 'company/announcements',
        dateScoped: true,
        employeeScoped: false,
        accessLevel: 'public',
        essential: false,
        allowedRoles: ['admin'],
        allowForTargetOther: ['admin'],
        requiredAccountantPermission: null,
        allowedMimes: DOCUMENT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    accounting_attachment: {
        canonical: 'accounting_attachment',
        shortCode: 'acc',
        label: 'Minh chứng đối soát & khiếu nại lương/kế toán',
        basePath: 'accounting/attachments',
        dateScoped: true,
        employeeScoped: true,
        accessLevel: 'private',
        essential: true,
        allowedRoles: ['worker', 'accountant', 'admin'],
        allowForTargetOther: ['admin', 'accountant'],
        requiredAccountantPermission: 'payroll_calculate',
        allowedMimes: DISPUTE_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    },
    system_import: {
        canonical: 'system_import',
        shortCode: 'imp',
        label: 'Tệp nhập liệu bảng tính hệ thống',
        basePath: 'system/imports',
        dateScoped: true,
        employeeScoped: false,
        accessLevel: 'private',
        essential: false,
        allowedRoles: ['accountant', 'admin'],
        allowForTargetOther: ['admin', 'accountant'],
        requiredAccountantPermission: 'payroll_export',
        allowedMimes: IMPORT_MIMES,
        maxBytesKey: 'maxDocumentSizeBytes'
    }
};

const CATEGORY_ALIASES = {
    avatar: 'employee_avatar',
    employee_avatar: 'employee_avatar',
    profile_avatar: 'employee_avatar',
    employee_document: 'employee_document',
    employee_attachment: 'employee_attachment',
    evidence_profile: 'employee_attachment',
    attendance: 'attendance_evidence',
    attendance_evidence: 'attendance_evidence',
    check_in: 'attendance_evidence',
    leave: 'leave_evidence',
    leave_evidence: 'leave_evidence',
    leave_request: 'leave_evidence',
    attendance_correction: 'attendance_adjustment',
    attendance_adjustment: 'attendance_adjustment',
    late_early: 'attendance_adjustment',
    supplement: 'attendance_adjustment',
    overtime: 'overtime_evidence',
    overtime_evidence: 'overtime_evidence',
    overtime_request: 'overtime_evidence',
    ot: 'overtime_evidence',
    shift_change: 'shift_change_evidence',
    shift_change_evidence: 'shift_change_evidence',
    shift_change_request: 'shift_change_evidence',
    business_trip: 'business_trip_document',
    business_trip_document: 'business_trip_document',
    cong_tac: 'business_trip_document',
    company_branding: 'company_branding',
    logo: 'company_branding',
    company_logo: 'company_branding',
    company_announcement: 'company_announcement',
    announcement: 'company_announcement',
    policy: 'company_announcement',
    accounting_attachment: 'accounting_attachment',
    accounting: 'accounting_attachment',
    salary_dispute: 'accounting_attachment',
    system_import: 'system_import',
    import: 'system_import'
};

function detectForbiddenUploadParams(rawParams = {}) {
    if (!rawParams || typeof rawParams !== 'object') return [];
    const found = [];
    for (const key of FORBIDDEN_CLIENT_OVERRIDE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(rawParams, key) && rawParams[key] !== undefined && rawParams[key] !== null && rawParams[key] !== '') {
            found.push(key);
        }
    }
    return found;
}

function resolveCategoryPolicy(rawCategory) {
    const clean = String(rawCategory || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const canonicalKey = CATEGORY_ALIASES[clean];
    if (!canonicalKey || !CATEGORY_POLICIES[canonicalKey]) {
        const err = new Error(`Loại nghiệp vụ upload "${rawCategory || ''}" không được hệ thống cho phép!`);
        err.statusCode = 400;
        err.code = 'UNSUPPORTED_UPLOAD_CATEGORY';
        throw err;
    }
    return CATEGORY_POLICIES[canonicalKey];
}

function sanitizeEmployeeFolderToken(rawCode) {
    const trimmed = String(rawCode || '').trim().toUpperCase();
    // Chỉ chấp nhận mã nhân viên kỹ thuật (VD: NV001, ADMIN), từ chối/hash nếu có ký tự giống PII (email, tên có dấu/khoảng trắng, SĐT)
    if (/^[A-Z0-9_-]{2,20}$/.test(trimmed) && !/^\d{9,15}$/.test(trimmed)) {
        return trimmed;
    }
    const shortHash = crypto.createHash('sha256').update(trimmed || 'UNKNOWN').digest('hex').slice(0, 12).toUpperCase();
    return `EMP_${shortHash}`;
}

function parseReferenceYearMonth(referenceDate) {
    const clean = String(referenceDate || '').trim().slice(0, 10);
    const match = clean.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (match) {
        const y = Number(match[1]);
        const m = Number(match[2]);
        if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) {
            return { year: String(y), month: String(m).padStart(2, '0') };
        }
    }
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
    return {
        year: String(vnTime.getUTCFullYear()),
        month: String(vnTime.getUTCMonth() + 1).padStart(2, '0')
    };
}

function resolveTargetAssetFolder(policy, { employeeId = null, referenceDate = '' } = {}) {
    const credCfg = getCloudinaryCredentialsConfig();
    const parts = [credCfg.rootFolder, policy.basePath];

    if (policy.dateScoped) {
        const { year, month } = parseReferenceYearMonth(referenceDate);
        parts.push(year, month);
    }

    if (policy.employeeScoped && employeeId) {
        parts.push(sanitizeEmployeeFolderToken(employeeId));
    }

    return parts.join('/').replace(/\/{2,}/g, '/');
}

function generateSafePublicIdSlug(policy) {
    const uuidPart = crypto.randomUUID().replace(/-/g, '');
    return `${policy.shortCode}_${uuidPart}`;
}

function getEffectiveMaxBytesForMime(policy, detectedMime) {
    const secCfg = getUploadSecurityConfig();
    if (detectedMime && detectedMime.startsWith('video/')) {
        return Math.min(policy.maxBytesCap || secCfg.maxVideoSizeBytes, secCfg.maxVideoSizeBytes);
    }
    if (detectedMime === 'application/pdf' || IMPORT_MIMES.includes(detectedMime)) {
        return Math.min(policy.maxBytesCap || secCfg.maxDocumentSizeBytes, secCfg.maxDocumentSizeBytes);
    }
    const baseCap = secCfg[policy.maxBytesKey] || secCfg.maxImageSizeBytes;
    return policy.maxBytesCap ? Math.min(policy.maxBytesCap, baseCap) : baseCap;
}

function resolveCloudinaryResourceType(detectedMime) {
    if (!detectedMime) return 'raw';
    if (detectedMime.startsWith('image/')) return 'image';
    if (detectedMime.startsWith('video/')) return 'video';
    return 'raw';
}

function getPublicCategoryCatalog() {
    const secCfg = getUploadSecurityConfig();
    return Object.values(CATEGORY_POLICIES).map((p) => ({
        category: p.canonical,
        label: p.label,
        access_level: p.accessLevel,
        essential: p.essential,
        allowed_mimes: p.allowedMimes,
        max_bytes: p.maxBytesCap
            ? Math.min(p.maxBytesCap, secCfg[p.maxBytesKey] || secCfg.maxImageSizeBytes)
            : (secCfg[p.maxBytesKey] || secCfg.maxImageSizeBytes)
    }));
}

module.exports = {
    FORBIDDEN_CLIENT_OVERRIDE_FIELDS,
    CATEGORY_POLICIES,
    CATEGORY_ALIASES,
    IMAGE_MIMES,
    DOCUMENT_MIMES,
    DISPUTE_MIMES,
    IMPORT_MIMES,
    detectForbiddenUploadParams,
    resolveCategoryPolicy,
    sanitizeEmployeeFolderToken,
    parseReferenceYearMonth,
    resolveTargetAssetFolder,
    generateSafePublicIdSlug,
    getEffectiveMaxBytesForMime,
    resolveCloudinaryResourceType,
    getPublicCategoryCatalog
};
