const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAttendanceInput } = require('../src/middlewares/validationMiddleware');

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
