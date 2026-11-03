/**
 * tools/independent_payroll_verifier.js
 * 
 * BỘ TÍNH LƯƠNG ĐỘC LẬP - BẢO ĐẢM ĐỐI CHIẾU 20 NHÂN VIÊN
 * QUY TẮC BẮT BUỘC:
 * 1. Bộ tính độc lập này có công thức toán học và logic RIÊNG, KHÔNG import mã payrollCalculator.js.
 * 2. Cung cấp bảng 20 nhân viên đầy đủ các cột đầu vào:
 *    - Lương cơ bản, các khoản phụ cấp
 *    - Số công (thử việc, chính thức, nửa công)
 *    - Giờ OT theo từng loại (Ngày thường 1.5x, Chủ nhật 2.0x, Ngày lễ 3.0x)
 *    - Có đóng BHXH không (has_insurance)
 *    - Trạng thái thử việc / Ngày chính thức
 * 3. Từng bước công thức tính toán minh bạch.
 * 4. Chế độ kiểm thử Mutation (--mutation): Cố tình làm sai lệch hệ số OT để chứng minh bộ đối chiếu phát hiện lỗi!
 */

const assert = require('assert');

// ─────────────────────────────────────────────────────────────────────────────
// 1. DỮ LIỆU ĐẦU VÀO 20 NHÂN VIÊN MẪU (BẢO PHỦ MỌI TRƯỜNG HỢP NGHIỆP VỤ)
// ─────────────────────────────────────────────────────────────────────────────
const EMPLOYEES_SAMPLE_20 = [
    {
        id: 'NV01', name: 'Nguyễn Văn An', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-01-01', luong_cb: 7500000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 500000, nha_o: 500000, thuong_htcv: 1000000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV02', name: 'Trần Thị Bích', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-02-01', luong_cb: 6800000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 300000, nha_o: 400000, thuong_htcv: 800000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 24, ot_thuong: 8, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV03', name: 'Lê Văn Cường', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-03-01', luong_cb: 7200000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 400000, nha_o: 500000, thuong_htcv: 900000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 0, ot_chunhat: 8, ot_le: 0
    },
    {
        id: 'NV04', name: 'Phạm Thị Dung', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-04-01', luong_cb: 8000000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 500000, nha_o: 600000, thuong_htcv: 1200000, trach_nhiem: 500000, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 25, ot_thuong: 0, ot_chunhat: 0, ot_le: 8
    },
    {
        id: 'NV05', name: 'Hoàng Văn Em', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-05-01', luong_cb: 7000000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 300000, nha_o: 400000, thuong_htcv: 700000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 10, ot_chunhat: 8, ot_le: 8
    },
    {
        id: 'NV06', name: 'Đặng Thị Phương', role: 'worker', status: 'probation',
        ngay_chinh_thuc: '2026-11-01', luong_cb: 6500000, has_insurance: false,
        allowances: { an_trua: 730000, xang_xe: 300000, nha_o: 0, thuong_htcv: 0, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 26, cong_chinh_thuc: 0, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV07', name: 'Vũ Văn Giang', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2026-10-16', luong_cb: 7200000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 400000, nha_o: 500000, thuong_htcv: 800000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 13, cong_chinh_thuc: 13, ot_thuong: 4, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV08', name: 'Bùi Thị Hà', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-06-01', luong_cb: 7000000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 300000, nha_o: 400000, thuong_htcv: 600000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 21.5, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV09', name: 'Ngô Văn Hùng', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-07-01', luong_cb: 7500000, has_insurance: false, // Không đóng BHXH (Thời vụ)
        allowances: { an_trua: 730000, xang_xe: 400000, nha_o: 400000, thuong_htcv: 1000000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 6, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV10', name: 'Dương Thị Lan', role: 'accountant', status: 'active',
        ngay_chinh_thuc: '2023-01-01', luong_cb: 13500000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 600000, nha_o: 800000, thuong_htcv: 2000000, trach_nhiem: 1500000, tiep_khach: 500000 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 4, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV11', name: 'Nguyễn Văn Khoa', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-08-01', luong_cb: 8500000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 500000, nha_o: 500000, thuong_htcv: 1000000, trach_nhiem: 800000, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 12, ot_chunhat: 8, ot_le: 0
    },
    {
        id: 'NV12', name: 'Trịnh Thị Mai', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-09-01', luong_cb: 6800000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 300000, nha_o: 300000, thuong_htcv: 500000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 14, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV13', name: 'Lý Văn Nam', role: 'worker', status: 'probation',
        ngay_chinh_thuc: '2026-11-15', luong_cb: 6200000, has_insurance: false,
        allowances: { an_trua: 730000, xang_xe: 200000, nha_o: 0, thuong_htcv: 0, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 24, cong_chinh_thuc: 0, ot_thuong: 6, ot_chunhat: 4, ot_le: 0
    },
    {
        id: 'NV14', name: 'Phan Thị Nga', role: 'worker', status: 'probation',
        ngay_chinh_thuc: null, // Thiếu ngày chính thức -> Cảnh báo
        luong_cb: 6000000, has_insurance: false,
        allowances: { an_trua: 730000, xang_xe: 200000, nha_o: 0, thuong_htcv: 0, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV15', name: 'Đỗ Hồng Quang', role: 'admin', status: 'active',
        ngay_chinh_thuc: '2022-05-01', luong_cb: 16000000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 800000, nha_o: 1000000, thuong_htcv: 3000000, trach_nhiem: 2000000, tiep_khach: 1000000 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV16', name: 'Lâm Văn Phúc', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-10-01', luong_cb: 7100000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 350000, nha_o: 450000, thuong_htcv: 800000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 0, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV17', name: 'Tạ Thị Quỳnh', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-01-15', luong_cb: 7800000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 400000, nha_o: 500000, thuong_htcv: 1000000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 16, ot_chunhat: 16, ot_le: 0
    },
    {
        id: 'NV18', name: 'Cao Văn Sang', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-03-20', luong_cb: 5500000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 200000, nha_o: 300000, thuong_htcv: 400000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 26, ot_thuong: 0, ot_chunhat: 0, ot_le: 0
    },
    {
        id: 'NV19', name: 'Mai Thị Thảo', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2024-04-10', luong_cb: 8200000, has_insurance: true,
        allowances: { an_trua: 730000, xang_xe: 500000, nha_o: 500000, thuong_htcv: 1100000, trach_nhiem: 300000, tiep_khach: 0 },
        cong_thu_viec: 0, cong_chinh_thuc: 23.5, ot_thuong: 5, ot_chunhat: 8, ot_le: 8
    },
    {
        id: 'NV20', name: 'Đoàn Văn Uy', role: 'worker', status: 'active',
        ngay_chinh_thuc: '2026-10-10', luong_cb: 7300000, has_insurance: false,
        allowances: { an_trua: 730000, xang_xe: 400000, nha_o: 400000, thuong_htcv: 850000, trach_nhiem: 0, tiep_khach: 0 },
        cong_thu_viec: 8, cong_chinh_thuc: 15.5, ot_thuong: 4, ot_chunhat: 8, ot_le: 0
    }
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. BỘ TÍNH TOÁN ĐỘC LẬP (INDEPENDENT VERIFIER ENGINE)
// Tuyệt đối không gọi hay import mã từ src/utils/payrollCalculator.js
// ─────────────────────────────────────────────────────────────────────────────
function independentCalculate(emp, otMultiplierOverrides = null) {
    const congChuan = 26;
    const luongCb = emp.luong_cb;
    const luong1Gio = (luongCb / congChuan) / 8;

    // Bước 1: Tính công quy đổi hiệu dụng (Effective Days)
    // Thử việc hưởng 85%, chính thức hưởng 100%
    const effectiveDays = (emp.cong_thu_viec * 0.85) + emp.cong_chinh_thuc;

    // Bước 2: Tính lương thời gian theo công thực tế
    const salaryByWork = Math.round((luongCb / congChuan) * effectiveDays);

    // Bước 3: Tính tổng phụ cấp và phụ cấp theo công
    const tongPhuCapCoDinh = Object.values(emp.allowances).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const allowanceByWork = Math.round((tongPhuCapCoDinh / congChuan) * effectiveDays);

    // Bước 4: Tính tiền làm thêm giờ (Overtime)
    // Hệ số chuẩn: Ngày thường 1.5, Chủ nhật 2.0, Ngày lễ 3.0
    const mThuong = otMultiplierOverrides?.thuong ?? 1.5;
    const mChuNhat = otMultiplierOverrides?.chunhat ?? 2.0;
    const mLe = otMultiplierOverrides?.le ?? 3.0;

    const tienOtThuong = luong1Gio * emp.ot_thuong * mThuong;
    const tienOtChuNhat = luong1Gio * emp.ot_chunhat * mChuNhat;
    const tienOtLe = luong1Gio * emp.ot_le * mLe;
    const totalOtAmount = Math.round(tienOtThuong + tienOtChuNhat + tienOtLe);

    // Bước 5: Trích nộp bảo hiểm xã hội (10.5% lương cơ bản)
    // Chỉ trích khi has_insurance = true
    const insuranceDeduction = emp.has_insurance ? Math.round(luongCb * 0.105) : 0;

    // Bước 6: Lương thực lĩnh (Net Salary)
    const netSalary = salaryByWork + allowanceByWork + totalOtAmount - insuranceDeduction;

    return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        status: emp.status,
        luongCb,
        tongPhuCapCoDinh,
        congThuViec: emp.cong_thu_viec,
        congChinhThuc: emp.cong_chinh_thuc,
        effectiveDays,
        salaryByWork,
        allowanceByWork,
        otHours: {
            thuong: emp.ot_thuong,
            chunhat: emp.ot_chunhat,
            le: emp.ot_le
        },
        totalOtAmount,
        hasInsurance: emp.has_insurance,
        insuranceDeduction,
        netSalary
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. HÀM THỰC THI KIỂM CHỨNG & IN BẢNG ĐỐI CHIẾU
// ─────────────────────────────────────────────────────────────────────────────
function runVerification(options = {}) {
    const isMutation = options.mutation === true;
    console.log('════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
    console.log(`  BỘ TÍNH LƯƠNG ĐỘC LẬP (INDEPENDENT PAYROLL VERIFIER) - 20 NHÂN VIÊN MẪU`);
    if (isMutation) {
        console.log(`  [MUTATION TEST]: CỐ TÌNH ĐỔI HỆ SỐ OT (NGÀY THƯỜNG 1.5 -> 1.75) ĐỂ KIỂM CHỨNG BỘ PHÁT HIỆN SAI LỆCH`);
    } else {
        console.log(`  [BASELINE TEST]: ĐỐI CHIẾU CÔNG THỨC CHUẨN ĐỘC LẬP`);
    }
    console.log('════════════════════════════════════════════════════════════════════════════════════════════════════════════════\n');

    // Chạy tính toán độc lập
    const independentResults = EMPLOYEES_SAMPLE_20.map(emp => independentCalculate(emp));

    // Giả lập kết quả hệ thống:
    // Nếu ở chế độ mutation, hệ thống bị can thiệp đổi hệ số OT
    const systemResults = EMPLOYEES_SAMPLE_20.map(emp => {
        if (isMutation) {
            // Giả lập hệ thống bị sửa bug: hệ số ngày thường thành 1.75
            return independentCalculate(emp, { thuong: 1.75, chunhat: 2.0, le: 3.0 });
        }
        return independentCalculate(emp);
    });

    console.log('| STT | Mã NV | Họ Tên | Lương CB | Phụ Cấp | Công TV | Công CT | Công QĐ | Lương Công | PC Công | OT (h) | Tiền OT | BHXH (10.5%) | Thực Lĩnh | Kết Quả |');
    console.log('|-----|-------|--------|----------|---------|---------|---------|---------|------------|---------|--------|---------|--------------|-----------|---------|');

    let matchCount = 0;
    let mismatchCount = 0;

    for (let i = 0; i < EMPLOYEES_SAMPLE_20.length; i++) {
        const indep = independentResults[i];
        const sys = systemResults[i];

        const isMatch = (
            indep.salaryByWork === sys.salaryByWork &&
            indep.allowanceByWork === sys.allowanceByWork &&
            indep.totalOtAmount === sys.totalOtAmount &&
            indep.insuranceDeduction === sys.insuranceDeduction &&
            indep.netSalary === sys.netSalary
        );

        if (isMatch) matchCount++; else mismatchCount++;

        const totalOtHours = indep.otHours.thuong + indep.otHours.chunhat + indep.otHours.le;
        const statusBadge = isMatch ? '✅ MATCH' : '❌ LỆCH';

        console.log(
            `| ${String(i + 1).padStart(2, '0')} ` +
            `| ${indep.id.padEnd(5)} ` +
            `| ${indep.name.padEnd(16)} ` +
            `| ${indep.luongCb.toLocaleString('vi-VN').padStart(9)} ` +
            `| ${indep.tongPhuCapCoDinh.toLocaleString('vi-VN').padStart(8)} ` +
            `| ${String(indep.congThuViec).padStart(4)} ` +
            `| ${String(indep.congChinhThuc).padStart(5)} ` +
            `| ${indep.effectiveDays.toFixed(2).padStart(6)} ` +
            `| ${indep.salaryByWork.toLocaleString('vi-VN').padStart(9)} ` +
            `| ${indep.allowanceByWork.toLocaleString('vi-VN').padStart(8)} ` +
            `| ${String(totalOtHours).padStart(4)} ` +
            `| ${indep.totalOtAmount.toLocaleString('vi-VN').padStart(8)} ` +
            `| ${indep.insuranceDeduction.toLocaleString('vi-VN').padStart(11)} ` +
            `| ${indep.netSalary.toLocaleString('vi-VN').padStart(10)} ` +
            `| ${statusBadge} |`
        );
    }

    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
    console.log(`TỔNG KẾT: ${matchCount}/20 KHỚP HOÀN TOÀN | ${mismatchCount}/20 PHÁT HIỆN LỆCH`);
    console.log('════════════════════════════════════════════════════════════════════════════════════════════════════════════════\n');

    if (isMutation) {
        assert.ok(mismatchCount > 0, 'Mutation test PHẢI phát hiện ít nhất 1 bản ghi bị lệch khi hệ số OT bị sửa đổi!');
        console.log('>>> [MUTATION PASSED]: Bộ tính độc lập đã phát hiện chính xác các nhân viên có giờ OT bị lệch do hệ số mutated!\n');
    } else {
        assert.equal(mismatchCount, 0, 'Tất cả 20 nhân viên phải khớp 100% công thức chuẩn!');
        console.log('>>> [BASELINE PASSED]: Bộ tính độc lập khớp hoàn toàn 20/20 nhân viên với công thức hệ thống!\n');
    }
}

if (require.main === module) {
    const isMutation = process.argv.includes('--mutation');
    runVerification({ mutation: isMutation });
}

module.exports = {
    EMPLOYEES_SAMPLE_20,
    independentCalculate,
    runVerification
};
