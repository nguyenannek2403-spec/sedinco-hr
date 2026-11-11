/**
 * Thuật toán tính lương chuẩn (Sedinco HR Payroll Calculation Engine)
 * Đã xác minh qua bộ test tự động TC-PAY-01 đến TC-PAY-08
 */

function calculateEmployeeSalary({
    luong_cb,
    cong_chuan = 26,
    ngay_chinh_thuc,
    status = 'active',
    chuc_danh = '',
    logs = [],
    holidays = [],
    allowances = {},
    has_insurance = true,
    otRegistrations = null
}) {
    const luongCb = Number(luong_cb) || 0;
    const congChuan = Number(cong_chuan) || 26;
    const luong1Gio = (luongCb / congChuan) / 8;

    let warning = null;
    const isProbationProfile = (status === 'probation' || String(chuc_danh).toLowerCase().includes('thử việc'));
    if (isProbationProfile && !ngay_chinh_thuc) {
        warning = 'CẢNH BÁO: Nhân viên đang ở trạng thái thử việc nhưng thiếu ngày chính thức (ngay_chinh_thuc). Hệ thống đang tính 100% lương theo mặc định!';
    }

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

    const actualWorkDays = congThuViec + congChinhThuc;
    const effectiveDays = (congThuViec * 0.85) + congChinhThuc;
    const salaryByWork = (luongCb / congChuan) * effectiveDays;
    const allowanceByWork = (tongPhuCapCoDinh / congChuan) * actualWorkDays;

    // Chi tiết từng khoản phụ cấp thực nhận theo tỷ lệ ngày công thực tế
    const workRatio = congChuan > 0 ? (actualWorkDays / congChuan) : 0;
    const allowances_breakdown = {
        an_trua: Math.round((Number(allowances.an_trua) || 0) * workRatio),
        xang_xe: Math.round((Number(allowances.xang_xe) || 0) * workRatio),
        nha_o: Math.round((Number(allowances.nha_o) || 0) * workRatio),
        thuong_htcv: Math.round((Number(allowances.thuong_htcv) || 0) * workRatio),
        trach_nhiem: Math.round((Number(allowances.trach_nhiem) || 0) * workRatio),
        tiep_khach: Math.round((Number(allowances.tiep_khach) || 0) * workRatio)
    };

    const grossSalary = salaryByWork + allowanceByWork + tienOt;
    // Nếu nhân viên không đi làm ngày nào (0 ngày công), không trích trừ BHXH và netSalary = 0 (tránh lương âm)
    let baoHiem = 0;
    let netSalary = 0;
    if (actualWorkDays === 0) {
        baoHiem = 0;
        netSalary = 0;
    } else {
        baoHiem = (has_insurance !== false && has_insurance !== 0) ? (luongCb * 0.105) : 0;
        netSalary = Math.max(0, Math.round(grossSalary - baoHiem));
    }

    return {
        baseSalary: luongCb,
        congThuViec,
        congChinhThuc,
        totalWorkDays: actualWorkDays,
        actualWorkDays,
        effectiveDays,
        salaryByWork: Math.round(salaryByWork),
        totalAllowance: Math.round(allowanceByWork),
        allowances_breakdown,
        otAmount: Math.round(tienOt),
        totalInsurance: Math.round(baoHiem),
        grossSalary: Math.round(grossSalary),
        netSalary,
        warning
    };
}

module.exports = {
    calculateEmployeeSalary
};
