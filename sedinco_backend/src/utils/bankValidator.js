/**
 * Chuẩn hóa & kiểm tra thông tin Thẻ ngân hàng nhận lương (chỉ lưu 4 trường text, tuyệt đối không lưu ảnh QR).
 */

function toUpperUnaccentedName(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toUpperCase()
        .replace(/[^A-Z0-9\s.'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

function sanitizeBankCardInput(payload = {}) {
    if (!payload || typeof payload !== 'object') {
        const err = new Error('Dữ liệu thẻ ngân hàng không hợp lệ!');
        err.statusCode = 400;
        throw err;
    }

    // Chặn tuyệt đối mọi payload chứa ảnh QR gửi lên server
    const forbiddenImageFields = ['qr_image', 'qr_base64', 'qr_data_url', 'image', 'image_base64'];
    for (const key of forbiddenImageFields) {
        if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
            const err = new Error('Vì lý do bảo mật, hệ thống tuyệt đối không tiếp nhận hoặc lưu trữ ảnh QR ngân hàng!');
            err.statusCode = 400;
            err.code = 'QR_IMAGE_STORAGE_FORBIDDEN';
            throw err;
        }
    }

    const bank_code = String(payload.bank_code || '').trim().toUpperCase().slice(0, 32);
    const bank_name = String(payload.bank_name || '').trim().slice(0, 120);
    const bank_account_number = String(payload.bank_account_number || '').replace(/\s+/g, '').trim();
    const bank_account_name = toUpperUnaccentedName(payload.bank_account_name || '');

    if (!bank_code || !/^[A-Z0-9_-]{2,32}$/.test(bank_code)) {
        const err = new Error('Vui lòng chọn mã ngân hàng hợp lệ!');
        err.statusCode = 400;
        throw err;
    }
    if (!bank_name || bank_name.length < 2) {
        const err = new Error('Vui lòng chọn tên ngân hàng hợp lệ!');
        err.statusCode = 400;
        throw err;
    }
    if (!/^[0-9]{5,25}$/.test(bank_account_number)) {
        const err = new Error('Số tài khoản ngân hàng chỉ được chứa chữ số (từ 5 đến 25 chữ số)!');
        err.statusCode = 400;
        throw err;
    }
    if (!bank_account_name || bank_account_name.length < 2) {
        const err = new Error('Vui lòng nhập Tên chủ tài khoản (chữ IN HOA không dấu)!');
        err.statusCode = 400;
        throw err;
    }

    return {
        bank_code,
        bank_name,
        bank_account_number,
        bank_account_name
    };
}

module.exports = {
    toUpperUnaccentedName,
    sanitizeBankCardInput
};
