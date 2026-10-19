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
    <div className="space-y-4">
      
      {/* 4 Card KPI Tổng Quan Tài Chính */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Tổng Quỹ Lương Net */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-5 shadow-lg shadow-emerald-600/15 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-200 font-bold uppercase tracking-wider">Tổng Quỹ Lương (Net)</span>
            <div className="p-2 bg-white/20 rounded-xl">
              <DollarSign size={20} className="text-white" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black tracking-tight">
              {totalNetSalary.toLocaleString("vi-VN")} đ
            </span>
            <span className="text-xs text-emerald-100 block mt-1 font-medium">Chi trả kỳ tháng {month}/{year}</span>
          </div>
        </div>

        {/* KPI 2: Tổng Số Nhân Sự */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Tổng Số Nhân Sự</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {totalEmployees} nhân sự
            </span>
            <span className="text-xs text-emerald-600 block mt-1 font-bold">100% hồ sơ hoàn tất</span>
          </div>
        </div>

        {/* KPI 3: Tổng Ngày Công Thực Tế */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Tổng Ngày Công Thực Tế</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {totalWorkDays.toFixed(1)} công
            </span>
            <span className="text-xs text-slate-400 block mt-1">Định mức chuẩn 26.0 ngày</span>
          </div>
        </div>

        {/* KPI 4: Bình Quân Thu Nhập */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Thu Nhập Bình Quân</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Award size={20} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {averageIncome > 0 ? `${(averageIncome / 1000000).toFixed(1)} tr` : "0 tr"}
            </span>
            <span className="text-xs text-slate-400 block mt-1">Bình quân thực nhận / người</span>
          </div>
        </div>

      </div>

      {/* Bảng Chi Tiết Toàn Bộ Nhân Sự */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Header Tác Vụ */}
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="text-emerald-600" size={20} />
              <h3 className="font-extrabold text-base text-slate-900 tracking-tight">
                BẢNG THANH TOÁN TIỀN LƯƠNG & PHỤ CẤP DOANH NGHIỆP
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống tự động tính theo công thức Luật Lao Động (85% thử việc, OT 1.5x-3.0x, BHXH 10.5%)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Bộ chọn tháng/năm */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1 shadow-sm">
              <button
                type="button"
                onClick={() => onMonthChange(month > 1 ? month - 1 : 12, month > 1 ? year : year - 1)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-bold text-xs px-2 text-slate-800">
                Tháng {month}/{year}
              </span>
              <button
                type="button"
                onClick={() => onMonthChange(month < 12 ? month + 1 : 1, month < 12 ? year : year + 1)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Tìm kiếm */}
            <div className="relative min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm nhân sự, chức vụ, mã NV..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 shadow-sm"
              />
            </div>

            {/* Nút Xuất CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Download size={14} />
              <span>Xuất CSV (Excel)</span>
            </button>

            {/* Nút In Bảng Lương */}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Printer size={14} />
              <span>In Bảng Lương</span>
            </button>

            {/* Nút Làm Mới */}
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all active:scale-95 cursor-pointer"
              title="Làm mới bảng lương"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin text-emerald-600" : ""} />
            </button>
          </div>
        </div>

        {/* Bảng Dữ Liệu Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                <th className="p-3 pl-5 min-w-[160px]">Cán Bộ Nhân Sự</th>
                <th className="p-3 text-right">Lương CB (HĐ)</th>
                <th className="p-3 text-center">Công TT</th>
                <th className="p-3 text-right">Lương Công</th>
                <th className="p-3 text-right">Tổng Phụ Cấp</th>
                <th className="p-3 text-right">Tăng Ca (OT)</th>
                <th className="p-3 text-right text-rose-600">Trích BHXH (10.5%)</th>
                <th className="p-3 text-right text-emerald-700 font-black">Thực Lĩnh (Net)</th>
                <th className="p-3 text-center pr-5">Phiếu Lương</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-emerald-600" />
                    <p className="text-xs">Đang tải và tính toán dữ liệu bảng lương...</p>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">Không có dữ liệu tiền lương trong kỳ tháng {month}/{year}.</p>
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const empId = item.ma_nv || item.id_nhan_vien;
                  return (
                    <tr key={empId || idx} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="p-3 pl-5">
                        <div className="font-bold text-slate-900">{item.ho_ten}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-blue-600 font-semibold">{empId}</span>
                          <span>•</span>
                          <span>{item.chuc_danh || "Nhân viên"}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-700">
                        {Number(item.baseSalary || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-black text-[11px]">
                          {item.totalWorkDays} công
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-700">
                        {Number(item.salaryByWork || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3 text-right font-medium text-slate-700">
                        {Number(item.totalAllowance || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3 text-right font-semibold text-indigo-700">
                        +{Number(item.otAmount || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3 text-right font-medium text-rose-600">
                        -{Number(item.insuranceDeduction || item.totalInsurance || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3 text-right text-emerald-600 font-black text-sm">
                        {Number(item.netSalary || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3 text-center pr-5">
                        <button
                          type="button"
                          onClick={() => setSelectedSlipItem(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 text-[11px] font-bold transition-all cursor-pointer"
                        >
                          <Eye size={12} />
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
                <tr className="bg-slate-100/80 font-black text-slate-900 border-t-2 border-slate-300">
                  <td className="p-3.5 pl-5 uppercase text-[11px]">TỔNG CỘNG ({filteredList.length} NV):</td>
                  <td className="p-3.5 text-right">
                    {filteredList.reduce((acc, c) => acc + (Number(c.baseSalary) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-3.5 text-center text-blue-700">
                    {totalWorkDays.toFixed(1)} công
                  </td>
                  <td className="p-3.5 text-right">
                    {filteredList.reduce((acc, c) => acc + (Number(c.salaryByWork) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-3.5 text-right">
                    {filteredList.reduce((acc, c) => acc + (Number(c.totalAllowance) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-3.5 text-right text-indigo-700">
                    +{filteredList.reduce((acc, c) => acc + (Number(c.otAmount) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-3.5 text-right text-rose-600">
                    -{filteredList.reduce((acc, c) => acc + (Number(c.insuranceDeduction || c.totalInsurance) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-3.5 text-right text-emerald-700 text-sm">
                    {totalNetSalary.toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-3.5 text-center pr-5"></td>
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
