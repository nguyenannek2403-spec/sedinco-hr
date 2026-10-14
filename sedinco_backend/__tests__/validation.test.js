const test = require('node:test');
const assert = require('node:assert/strict');

// Logic thẩm tra tham số chấm công (tương ứng server.js: lines 302-317)
function validateAttendanceInput({ ma_nv, day, month, year, status, ot_hours }) {
    if (!ma_nv || day === undefined || month === undefined || year === undefined) {
        return { valid: false, error: 'Thiếu mã nhân viên hoặc thời gian chấm công!' };
    }

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (isNaN(d) || d < 1 || d > 31 || isNaN(m) || m < 1 || m > 12 || isNaN(y) || y < 2000 || y > 2100) {
        return { valid: false, error: 'Ngày tháng năm không hợp lệ!' };
    }

    let hours = ot_hours !== undefined ? Number(ot_hours) : 0;
    if (isNaN(hours) || hours < 0) hours = 0;
    if (hours > 24) hours = 24; // Chống tràn và hạn chế rủi ro DoS / gian lận

    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isDelete = (!status || status === '');

    return {
        valid: true,
        dateStr,
        hours,
        isDelete,
        status
    };
}

test('TC-ATT-01: Thẩm tra input chấm công hợp lệ', () => {
    const res = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 15,
        month: 10,
        year: 2026,
        status: '1',
        ot_hours: 0
    });
    assert.equal(res.valid, true);
    assert.equal(res.dateStr, '2026-10-15');
    assert.equal(res.hours, 0);
    assert.equal(res.isDelete, false);
});

test('TC-ATT-02: Thẩm tra khi status rỗng hoặc null -> Đánh dấu xóa công', () => {
    const resEmpty = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 15,
        month: 10,
        year: 2026,
        status: ''
    });
    assert.equal(resEmpty.valid, true);
    assert.equal(resEmpty.isDelete, true);

    const resNull = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 15,
        month: 10,
        year: 2026,
        status: null
    });
    assert.equal(resNull.valid, true);
    assert.equal(resNull.isDelete, true);
});

test('TC-ATT-03: Thẩm tra ngày không hợp lệ (day > 31 hoặc day < 1)', () => {
    const resOver = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 32,
        month: 10,
        year: 2026,
        status: '1'
    });
    assert.equal(resOver.valid, false);
    assert.match(resOver.error, /Ngày tháng năm không hợp lệ/);

    const resNegative = validateAttendanceInput({
        ma_nv: 'NV001',
        day: -1,
        month: 10,
        year: 2026,
        status: '1'
    });
    assert.equal(resNegative.valid, false);
});

test('TC-ATT-04: Thẩm tra tháng không hợp lệ (month > 12 hoặc month < 1)', () => {
    const resOverMonth = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 15,
        month: 13,
        year: 2026,
        status: '1'
    });
    assert.equal(resOverMonth.valid, false);

    const resZeroMonth = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 15,
        month: 0,
        year: 2026,
        status: '1'
    });
    assert.equal(resZeroMonth.valid, false);
});

test('TC-ATT-05: Giới hạn số giờ OT không được vượt quá 24h và không âm', () => {
    const resOverOT = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 10,
        month: 10,
        year: 2026,
        status: 'OT',
        ot_hours: 99.5
    });
    assert.equal(resOverOT.valid, true);
    assert.equal(resOverOT.hours, 24); // Đã bị giới hạn ở trần 24h

    const resNegOT = validateAttendanceInput({
        ma_nv: 'NV001',
        day: 10,
        month: 10,
        year: 2026,
        status: 'OT',
        ot_hours: -5
    });
    assert.equal(resNegOT.valid, true);
    assert.equal(resNegOT.hours, 0); // Âm -> đưa về 0
});
