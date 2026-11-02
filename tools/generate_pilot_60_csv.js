const fs = require('fs');
const path = require('path');

const firstNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const middleNames = ['Văn', 'Thị', 'Đức', 'Hữu', 'Minh', 'Ngọc', 'Quốc', 'Thu', 'Thanh', 'Hồng', 'Kim', 'Bảo'];
const lastNames = ['An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hà', 'Hạnh', 'Khánh', 'Lan', 'Mai', 'Nam', 'Oanh', 'Phúc', 'Quỳnh', 'Sơn', 'Thảo', 'Trang', 'Tùng', 'Vinh', 'Yến'];

const departments = [
    { name: 'Tổ may 1', salary: 7200000 },
    { name: 'Tổ may 2', salary: 7500000 },
    { name: 'Tổ cắt', salary: 7800000 },
    { name: 'Tổ là ủi', salary: 6800000 },
    { name: 'Tổ đóng gói', salary: 6500000 },
    { name: 'Kho vận', salary: 7000000 },
    { name: 'Bảo trì', salary: 8200000 },
    { name: 'KCS Kiểm phẩm', salary: 8000000 }
];

const rows = [
    ['ma_nv', 'ho_ten', 'chuc_danh', 'role', 'dien_thoai', 'email', 'luong_cb']
];

// 1. Quản trị viên
rows.push(['NV_ADM01', 'Đỗ Hồng Quang', 'Quản trị hệ thống', 'admin', '0901111101', 'quang.dh@sedinco.vn', 16000000]);

// 2. Kế toán
rows.push(['NV_ACC01', 'Trần Thu Hà', 'Kế toán trưởng', 'accountant', '0902222201', 'ha.tt@sedinco.vn', 13500000]);
rows.push(['NV_ACC02', 'Vũ Đức Thắng', 'Kế toán viên', 'accountant', '0902222202', 'thang.vd@sedinco.vn', 9500000]);

// 3. 57 Công nhân
for (let i = 1; i <= 57; i++) {
    const ma_nv = `NV_W${String(i).padStart(3, '0')}`;
    const fn = firstNames[i % firstNames.length];
    const mn = middleNames[(i * 3) % middleNames.length];
    const ln = lastNames[(i * 7) % lastNames.length];
    const ho_ten = `${fn} ${mn} ${ln}`;
    const dept = departments[i % departments.length];
    const dien_thoai = `0903${String(i).padStart(6, '0')}`;
    const email = `worker${i}@sedinco.local`;
    const luong_cb = dept.salary + (i % 5) * 200000;
    rows.push([ma_nv, ho_ten, dept.name, 'worker', dien_thoai, email, luong_cb]);
}

const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
const targetPath = path.join(__dirname, '../data/employees_60_pilot.csv');
fs.writeFileSync(targetPath, csvContent, 'utf-8');
console.log(`✅ Đã tạo file ${targetPath} với ${rows.length - 1} nhân viên (có BOM UTF-8 tiếng Việt)!`);
