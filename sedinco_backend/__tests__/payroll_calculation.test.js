const test = require('node:test');
const assert = require('node:assert/strict');

// Hàm tính toán lương mô phỏng chính xác thuật toán trong server.js: lines 358-422
function calculateEmployeeSalary({
    luong_cb,
    cong_chuan = 26,
    ngay_chinh_thuc,
    logs = [],
    holidays = [],
    allowances = {},
    has_insurance = true
}) {
    const luongCb = Number(luong_cb) || 0;
    const congChuan = Number(cong_chuan) || 26;
    const luong1Gio = (luongCb / congChuan) / 8;

    const ngayChinhThuc = ngay_chinh_thuc ? new Date(ngay_chinh_thuc) : null;
    if (ngayChinhThuc) ngayChinhThuc.setHours(0, 0, 0, 0);

    let congThuViec = 0;
    let congChinhThuc = 0;
    let tienOt = 0;

    logs.forEach(log => {
        const logDate = new Date(log.record_date);
        logDate.setHours(0, 0, 0, 0);

        const isSunday = (log.dow === 1);
        let isHoliday = false;
        for (let h of holidays) {
            const startDate = new Date(h.start_date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(h.end_date);
            endDate.setHours(23, 59, 59, 999);
            if (logDate >= startDate && logDate <= endDate) {
                isHoliday = true;
                break;
            }
        }

        const isProbation = ngayChinhThuc && (logDate < ngayChinhThuc);

        if (log.status === '1') {
            if (isProbation) congThuViec += 1; else congChinhThuc += 1;
        } else if (log.status === '0.5') {
            if (isProbation) congThuViec += 0.5; else congChinhThuc += 0.5;
        } else if (log.status === 'OT') {
            let heSo = isHoliday ? 3.0 : (isSunday ? 2.0 : 1.5);
            let soGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : ((isHoliday || isSunday) ? 8 : 4);
            tienOt += (luong1Gio * soGioOT * heSo);
        } else if (log.status === '1/OT') {
            if (isProbation) congThuViec += 1; else congChinhThuc += 1;
            let heSo = isHoliday ? 3.0 : (isSunday ? 2.0 : 1.5);
            let soGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : ((isHoliday || isSunday) ? 8 : 4);
            tienOt += (luong1Gio * soGioOT * heSo);
        }
    });

    const tongPhuCapCoDinh = (Number(allowances.an_trua) || 0) +
                             (Number(allowances.xang_xe) || 0) +
                             (Number(allowances.nha_o) || 0) +
                             (Number(allowances.thuong_htcv) || 0) +
                             (Number(allowances.trach_nhiem) || 0) +
                             (Number(allowances.tiep_khach) || 0);

    const effectiveDays = (congThuViec * 0.85) + congChinhThuc;
    const salaryByWork = (luongCb / congChuan) * effectiveDays;
    const allowanceByWork = (tongPhuCapCoDinh / congChuan) * effectiveDays;
    let baoHiem = (has_insurance !== false && has_insurance !== 0) ? (luongCb * 0.105) : 0;

    return {
        baseSalary: luongCb,
        congThuViec,
        congChinhThuc,
        totalWorkDays: congThuViec + congChinhThuc,
        effectiveDays,
        salaryByWork: Math.round(salaryByWork),
        totalAllowance: Math.round(allowanceByWork),
        otAmount: Math.round(tienOt),
        totalInsurance: Math.round(baoHiem),
        netSalary: Math.round(salaryByWork + allowanceByWork + tienOt - baoHiem)
    };
}

test('TC-PAY-01: Tính lương cơ bản 1 ngày & 1 giờ chuẩn 26 ngày', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 10400000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2026-01-01',
        logs: [
            { record_date: '2026-10-01', status: '1', dow: 5 } // Thứ 5
        ]
    });
    // 10,400,000 / 26 = 400,000 đ/ngày
    assert.equal(res.salaryByWork, 400000);
    assert.equal(res.congChinhThuc, 1);
    assert.equal(res.congThuViec, 0);
});

test('TC-PAY-02: Phân tách công thử việc (85%) và chính thức (100%)', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 26000000,
        cong_chuan: 26, // 1,000,000 đ/ngày
        ngay_chinh_thuc: '2026-10-15',
        logs: [
            { record_date: '2026-10-10', status: '1', dow: 7 }, // Trước ngày 15 -> Thử việc: 1,000,000 * 0.85 = 850,000
            { record_date: '2026-10-12', status: '1', dow: 2 }, // Trước ngày 15 -> Thử việc: 1,000,000 * 0.85 = 850,000
            { record_date: '2026-10-16', status: '1', dow: 6 }, // Từ ngày 15 -> Chính thức: 1,000,000
        ],
        has_insurance: false
    });
    assert.equal(res.congThuViec, 2);
    assert.equal(res.congChinhThuc, 1);
    assert.equal(res.effectiveDays, 2 * 0.85 + 1); // 2.7 ngày
    assert.equal(res.salaryByWork, 2700000); // 1,000,000 * 2.7
});

test('TC-PAY-03: Tính tiền OT ngày thường với hệ số 1.5x', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 5200000, // Lương 1 ngày: 200,000đ -> 1 giờ: 25,000đ
        cong_chuan: 26,
        ngay_chinh_thuc: '2026-01-01',
        logs: [
            { record_date: '2026-10-06', status: 'OT', ot_hours: 4, dow: 3 } // Thứ 3, 4h OT
        ],
        has_insurance: false
    });
    // 25,000 * 4h * 1.5 = 150,000đ
    assert.equal(res.otAmount, 150000);
});

test('TC-PAY-04: Tính tiền OT ngày Chủ Nhật với hệ số 2.0x', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 5200000, // 25,000đ/giờ
        cong_chuan: 26,
        ngay_chinh_thuc: '2026-01-01',
        logs: [
            { record_date: '2026-10-04', status: 'OT', ot_hours: 5, dow: 1 } // Chủ Nhật (dow=1), 5h OT
        ],
        has_insurance: false
    });
    // 25,000 * 5h * 2.0 = 250,000đ
    assert.equal(res.otAmount, 250000);
});

test('TC-PAY-05: Tính tiền OT ngày Lễ với hệ số 3.0x', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 5200000, // 25,000đ/giờ
        cong_chuan: 26,
        ngay_chinh_thuc: '2026-01-01',
        holidays: [
            { start_date: '2026-09-01', end_date: '2026-09-02' }
        ],
        logs: [
            { record_date: '2026-09-02', status: 'OT', ot_hours: 8, dow: 4 } // Trùng ngày lễ 02/09, 8h OT
        ],
        has_insurance: false
    });
    // 25,000 * 8h * 3.0 = 600,000đ
    assert.equal(res.otAmount, 600000);
});

test('TC-PAY-06: Trích trừ bảo hiểm xã hội 10.5% khi has_insurance = true', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 10000000,
        cong_chuan: 26,
        has_insurance: true,
        logs: []
    });
    // 10,000,000 * 10.5% = 1,050,000đ
    assert.equal(res.totalInsurance, 1050000);
});

test('TC-PAY-07: Không trích bảo hiểm khi has_insurance = false hoặc 0', () => {
    const resFalse = calculateEmployeeSalary({
        luong_cb: 10000000,
        cong_chuan: 26,
        has_insurance: false,
        logs: []
    });
    assert.equal(resFalse.totalInsurance, 0);

    const resZero = calculateEmployeeSalary({
        luong_cb: 10000000,
        cong_chuan: 26,
        has_insurance: 0,
        logs: []
    });
    assert.equal(resZero.totalInsurance, 0);
});

test('TC-PAY-08: Tính tổng thực lĩnh Net Salary đầy đủ (Công + Phụ cấp + OT - BHXH)', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 13000000, // 500,000 đ/ngày -> 62,500 đ/giờ
        cong_chuan: 26,
        ngay_chinh_thuc: '2026-01-01',
        allowances: {
            an_trua: 730000,
            xang_xe: 500000,
            nha_o: 500000,
            thuong_htcv: 0,
            trach_nhiem: 0,
            tiep_khach: 0
        }, // Tổng phụ cấp: 1,730,000đ
        has_insurance: true, // BHXH: 1,365,000đ
        logs: [
            // Đi làm 26 ngày chuẩn
            ...Array.from({ length: 26 }, (_, i) => ({
                record_date: `2026-10-${String(i + 1).padStart(2, '0')}`,
                status: '1',
                dow: ((i + 3) % 7) + 1
            })),
            // Làm thêm 4h ngày thường
            { record_date: '2026-10-27', status: 'OT', ot_hours: 4, dow: 3 }
        ]
    });

    // Lương công: 13,000,000
    // Phụ cấp đủ 26/26: 1,730,000
    // OT: 62,500 * 4h * 1.5 = 375,000
    // BHXH: 1,365,000
    // Net: 13,000,000 + 1,730,000 + 375,000 - 1,365,000 = 13,740,000
    assert.equal(res.salaryByWork, 13000000);
    assert.equal(res.totalAllowance, 1730000);
    assert.equal(res.otAmount, 375000);
    assert.equal(res.totalInsurance, 1365000);
    assert.equal(res.netSalary, 13740000);
});
