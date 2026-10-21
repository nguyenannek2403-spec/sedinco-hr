/**
 * Thuật toán tính lương chuẩn (Sedinco HR Payroll Calculation Engine)
 * Đã xác minh qua bộ test tự động TC-PAY-01 đến TC-PAY-08
 */

function calculateEmployeeSalary({
    luong_cb,
    cong_chuan = 26,
    ngay_chinh_thuc,
    logs = [],
    holidays = [],
    allowances = {},
    has_insurance = true,
    otRegistrations = null
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
        } else if (log.status === 'OT' || log.status === '1/OT') {
            if (log.status === '1/OT') {
                if (isProbation) congThuViec += 1; else congChinhThuc += 1;
            }
            let heSo = isHoliday ? 3.0 : (isSunday ? 2.0 : 1.5);
            let soGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : ((isHoliday || isSunday) ? 8 : 4);

            // Kiểm soát OT duyệt trước (Anti-OT Fraud): Chỉ tính giờ OT khi có đơn duyệt trước
            if (Array.isArray(otRegistrations)) {
                const reg = otRegistrations.find(r => {
                    const rDate = new Date(r.work_date);
                    rDate.setHours(0, 0, 0, 0);
                    return rDate.getTime() === logDate.getTime() && r.status === 'approved';
                });
                soGioOT = reg ? Math.min(soGioOT, Number(reg.expected_hours)) : 0;
            }

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

module.exports = {
    calculateEmployeeSalary
};
