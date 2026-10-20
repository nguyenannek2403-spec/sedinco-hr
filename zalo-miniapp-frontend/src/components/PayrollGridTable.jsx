import React, { useState } from "react";
import {
  DollarSign,
  Search,
  Download,
  Printer,
  FileText,
  Users,
  Award,
  TrendingUp,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye
} from "lucide-react";
import SalarySlipModal from "./SalarySlipModal";
import { sanitizeFormula } from "../utils/api";

export default function PayrollGridTable({
  payrollData,
  month,
  year,
  onMonthChange,
  onRefresh,
  isLoading
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSlipItem, setSelectedSlipItem] = useState(null);

  // Lọc dữ liệu theo tìm kiếm
  const filteredList = (payrollData || []).filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const id = (item.ma_nv || item.id_nhan_vien || "").toLowerCase();
    const name = (item.ho_ten || "").toLowerCase();
    const role = (item.chuc_danh || "").toLowerCase();
    return id.includes(q) || name.includes(q) || role.includes(q);
  });

  // Tính 4 chỉ số KPI tổng hợp
  const totalNetSalary = filteredList.reduce((acc, cur) => acc + (Number(cur.netSalary) || 0), 0);
  const totalEmployees = filteredList.length;
  const totalWorkDays = filteredList.reduce((acc, cur) => acc + (Number(cur.totalWorkDays) || 0), 0);
  const averageIncome = totalEmployees > 0 ? totalNetSalary / totalEmployees : 0;

  // Xuất file CSV UTF-8 BOM chuẩn tiếng Việt
  const handleExportCSV = () => {
    const headers = [
      "Mã NV",
      "Họ và Tên",
      "Chức Danh",
      "Lương Cơ Bản",
      "Ngày Công",
      "Lương Theo Công",
      "Phụ Cấp Ăn Trưa",
      "Phụ Cấp Xăng Xe",
      "Phụ Cấp Nhà Ở",
      "Thưởng HTCV",
      "Phụ Cấp Trách Nhiệm",
      "Tổng Phụ Cấp",
      "Tiền Tăng Ca (OT)",
      "Khấu Trừ BHXH (10.5%)",
      "Thực Lĩnh (Net)"
    ];

    const rows = filteredList.map(item => {
      const totalAllowance = Number(item.totalAllowance) || 0;
      const respAllowance = totalAllowance > 3730000 ? totalAllowance - 3730000 : 0;
      return [
        `"${sanitizeFormula(item.ma_nv || item.id_nhan_vien || "")}"`,
        `"${sanitizeFormula(item.ho_ten || "")}"`,
        `"${sanitizeFormula(item.chuc_danh || "Nhân viên")}"`,
        Number(item.baseSalary) || 0,
        Number(item.totalWorkDays) || 0,
        Number(item.salaryByWork) || 0,
        730000,
        500000,
        1000000,
        1500000,
        respAllowance,
        totalAllowance,
        Number(item.otAmount) || 0,
        Number(item.insuranceDeduction || item.totalInsurance) || 0,
        Number(item.netSalary) || 0
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bang_Luong_Sedinco_Thang_${month}_${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      
      {/* 4 Card KPI Tổng Quan Tài Chính */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Tổng Quỹ Lương Net */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white rounded-3xl p-5 shadow-md border-2 border-emerald-700 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-100 font-black uppercase tracking-wider">Tổng Quỹ Lương (Net)</span>
            <div className="p-2 bg-white/20 rounded-xl border border-white/30">
              <DollarSign size={22} className="text-white" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black tracking-tight">
              {totalNetSalary.toLocaleString("vi-VN")} đ
            </span>
            <span className="text-xs text-emerald-100 block mt-1 font-bold">Chi trả kỳ tháng {month}/{year}</span>
          </div>
        </div>

        {/* KPI 2: Tổng Số Nhân Sự */}
        <div className="bg-white rounded-3xl p-5 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 font-black uppercase tracking-wider">Tổng Số Nhân Sự</span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl border-2 border-blue-200">
              <Users size={22} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {totalEmployees} nhân sự
            </span>
            <span className="text-xs text-emerald-700 block mt-1 font-bold">100% hồ sơ hoàn tất</span>
          </div>
        </div>

        {/* KPI 3: Tổng Ngày Công Thực Tế */}
        <div className="bg-white rounded-3xl p-5 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 font-black uppercase tracking-wider">Tổng Ngày Công Thực Tế</span>
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border-2 border-indigo-200">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {totalWorkDays.toFixed(1)} công
            </span>
            <span className="text-xs text-slate-500 font-semibold block mt-1">Định mức chuẩn 26.0 ngày</span>
          </div>
        </div>

        {/* KPI 4: Bình Quân Thu Nhập */}
        <div className="bg-white rounded-3xl p-5 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 font-black uppercase tracking-wider">Thu Nhập Bình Quân</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border-2 border-amber-200">
              <Award size={22} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {averageIncome > 0 ? `${(averageIncome / 1000000).toFixed(1)} tr` : "0 tr"}
            </span>
            <span className="text-xs text-slate-500 font-semibold block mt-1">Bình quân thực nhận / người</span>
          </div>
        </div>

      </div>

      {/* Bảng Chi Tiết Toàn Bộ Nhân Sự */}
      <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden">
        
        {/* Header Tác Vụ */}
        <div className="p-5 border-b-2 border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="text-emerald-600" size={24} />
              <h3 className="font-black text-lg md:text-xl text-slate-900 tracking-tight">
                BẢNG THANH TOÁN TIỀN LƯƠNG & PHỤ CẤP DOANH NGHIỆP
              </h3>
            </div>
            <p className="text-sm font-medium text-slate-600 mt-1">
              Hệ thống tự động tính theo công thức Luật Lao Động (85% thử việc, OT 1.5x-3.0x, BHXH 10.5%)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Bộ chọn tháng/năm */}
            <div className="flex items-center bg-white border-2 border-slate-300 rounded-xl px-2.5 py-1.5 shadow-sm">
              <button
                type="button"
                onClick={() => onMonthChange(month > 1 ? month - 1 : 12, month > 1 ? year : year - 1)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer border border-transparent hover:border-slate-300"
                title="Tháng trước"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="font-black text-sm px-3 text-slate-900">
                Tháng {month}/{year}
              </span>
              <button
                type="button"
                onClick={() => onMonthChange(month < 12 ? month + 1 : 1, month < 12 ? year : year + 1)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer border border-transparent hover:border-slate-300"
                title="Tháng sau"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Tìm kiếm */}
            <div className="relative min-w-[220px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm nhân sự, chức vụ, mã NV..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm font-semibold bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-600 shadow-sm"
              />
            </div>

            {/* Nút Xuất CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black px-4 py-2.5 rounded-xl border-2 border-emerald-700 shadow-sm cursor-pointer"
            >
              <Download size={16} />
              <span>Xuất CSV (Excel)</span>
            </button>

            {/* Nút In Bảng Lương */}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-black px-4 py-2.5 rounded-xl border-2 border-slate-800 shadow-sm cursor-pointer"
            >
              <Printer size={16} />
              <span>In Bảng Lương</span>
            </button>

            {/* Nút Làm Mới */}
            <button
              type="button"
              onClick={onRefresh}
              className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border-2 border-slate-300 shadow-sm cursor-pointer"
              title="Làm mới bảng lương"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin text-emerald-600" : ""} />
            </button>
          </div>
        </div>

        {/* Bảng Dữ Liệu Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-black border-b-2 border-slate-300 uppercase text-xs">
                <th className="p-3.5 pl-5 min-w-[180px]">Cán Bộ Nhân Sự</th>
                <th className="p-3.5 text-right">Lương CB (HĐ)</th>
                <th className="p-3.5 text-center">Công TT</th>
                <th className="p-3.5 text-right">Lương Công</th>
                <th className="p-3.5 text-right">Tổng Phụ Cấp</th>
                <th className="p-3.5 text-right">Tăng Ca (OT)</th>
                <th className="p-3.5 text-right text-rose-700">Trích BHXH (10.5%)</th>
                <th className="p-3.5 text-right text-emerald-900 font-black">Thực Lĩnh (Net)</th>
                <th className="p-3.5 text-center pr-5">Phiếu Lương</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-500">
                    <RefreshCw size={28} className="mx-auto mb-2 animate-spin text-emerald-600" />
                    <p className="text-sm font-bold">Đang tải và tính toán dữ liệu bảng lương...</p>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-500">
                    <FileText size={36} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-bold">Không có dữ liệu tiền lương trong kỳ tháng {month}/{year}.</p>
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const empId = item.ma_nv || item.id_nhan_vien;
                  return (
                    <tr key={empId || idx} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="p-3.5 pl-5">
                        <div className="font-black text-slate-900 text-sm">{item.ho_ten}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-blue-700 font-bold">{empId}</span>
                          <span>•</span>
                          <span className="font-medium">{item.chuc_danh || "Nhân viên"}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-800 text-sm">
                        {Number(item.baseSalary || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="inline-block px-3 py-1 rounded-xl bg-blue-100 text-blue-900 font-black text-xs border border-blue-300">
                          {item.totalWorkDays} công
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-800 text-sm">
                        {Number(item.salaryByWork || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-800 text-sm">
                        {Number(item.totalAllowance || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-bold text-indigo-800 text-sm">
                        +{Number(item.otAmount || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-bold text-rose-700 text-sm">
                        -{Number(item.insuranceDeduction || item.totalInsurance || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right text-emerald-800 font-black text-base">
                        {Number(item.netSalary || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-center pr-5">
                        <button
                          type="button"
                          onClick={() => setSelectedSlipItem(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-100 text-slate-800 hover:text-emerald-900 text-xs font-black border-2 border-slate-300 hover:border-emerald-600 transition-all cursor-pointer"
                        >
                          <Eye size={14} />
                          <span>Chi tiết</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredList.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 text-slate-900 border-t-2 border-slate-300 font-black">
                  <td className="p-4 pl-5 uppercase text-xs">TỔNG CỘNG ({filteredList.length} NV):</td>
                  <td className="p-4 text-right text-sm">
                    {filteredList.reduce((acc, c) => acc + (Number(c.baseSalary) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-center text-blue-800 text-sm">
                    {totalWorkDays.toFixed(1)} công
                  </td>
                  <td className="p-4 text-right text-sm">
                    {filteredList.reduce((acc, c) => acc + (Number(c.salaryByWork) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-sm">
                    {filteredList.reduce((acc, c) => acc + (Number(c.totalAllowance) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-indigo-800 text-sm">
                    +{filteredList.reduce((acc, c) => acc + (Number(c.otAmount) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-rose-700 text-sm">
                    -{filteredList.reduce((acc, c) => acc + (Number(c.insuranceDeduction || c.totalInsurance) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-emerald-800 text-base">
                    {totalNetSalary.toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-center pr-5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

      </div>

      {/* Modal Phiếu Lương Chi Tiết */}
      {selectedSlipItem && (
        <SalarySlipModal
          payrollItem={selectedSlipItem}
          month={month}
          year={year}
          onClose={() => setSelectedSlipItem(null)}
        />
      )}

    </div>
  );
}
