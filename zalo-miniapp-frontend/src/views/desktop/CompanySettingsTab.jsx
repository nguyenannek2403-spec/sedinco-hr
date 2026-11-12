import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  Compass,
  Clock,
  DollarSign,
  AlertTriangle,
  Save,
  RefreshCw,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import { safeGet, safePut, safePost } from "../../utils/api";

export default function CompanySettingsTab({ currentUser, showToast }) {
  const [config, setConfig] = useState({
    company_name: "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
    address: "Khu Công Nghiệp Hòa Khánh, Liên Chiểu, Đà Nẵng",
    work_start: "08:00",
    lunch_start: "12:00",
    lunch_end: "13:30",
    work_end: "17:30",
    grace_period_minutes: 15,
    penalty_per_minute: 2000,
    penalty_fixed_block: 50000,
    standard_work_days: 26,
    probation_salary_percent: 85,
    ot_rate_weekday: 1.5,
    ot_rate_weekend: 2.0,
    ot_rate_holiday: 3.0,
    custom_ot_hourly_rate: 0,
    insurance_rate: 10.5,
    latitude: 16.0544,
    longitude: 108.2022,
    radius_meters: 5000,
    log_retention_days: 30
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const compRes = await safeGet("/company");
      if (compRes?.success && compRes.data) {
        const d = compRes.data;
        setConfig((prev) => ({
          ...prev,
          ...d,
          company_name: d.company_name || d.name || prev.company_name,
          work_start: d.work_start || "08:00",
          lunch_start: d.lunch_start || "12:00",
          lunch_end: d.lunch_end || "13:30",
          work_end: d.work_end || "17:30",
          grace_period_minutes: Number(d.grace_period_minutes ?? 15),
          penalty_per_minute: Number(d.penalty_per_minute ?? 2000),
          penalty_fixed_block: Number(d.penalty_fixed_block ?? 50000),
          standard_work_days: Number(d.standard_work_days ?? 26),
          probation_salary_percent: Number(d.probation_salary_percent ?? 85),
          ot_rate_weekday: Number(d.ot_rate_weekday ?? 1.5),
          ot_rate_weekend: Number(d.ot_rate_weekend ?? 2.0),
          ot_rate_holiday: Number(d.ot_rate_holiday ?? 3.0),
          custom_ot_hourly_rate: Number(d.custom_ot_hourly_rate ?? 0),
          insurance_rate: Number(d.insurance_rate ?? 10.5),
          radius_meters: Number(d.radius_meters ?? d.geofence_radius ?? 5000),
          log_retention_days: Number(d.log_retention_days ?? 30)
        }));
      }
    } catch (e) {
      console.warn("Lỗi tải cài đặt:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveAll = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await safePut("/company", {
        ...config,
        name: config.company_name,
        geofence_radius: Number(config.radius_meters)
      });
      if (res?.success) {
        if (showToast) {
          showToast(
            "Đã lưu toàn bộ Cấu hình Giờ làm việc, Hệ số OT, BHXH & Tọa độ GPS thành công!",
            "success"
          );
        }
      } else {
        if (showToast) showToast(res?.message || "Không thể lưu cấu hình.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi lưu cấu hình công ty.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm("Bạn có muốn khôi phục các thông số Giờ làm việc (08:00-17:30), Công chuẩn (26), OT (1.5x/2.0x/3.0x), BHXH (10.5%) về mặc định?")) {
      return;
    }
    setResetting(true);
    try {
      const res = await safePost("/company/reset-defaults", {});
      if (res?.success) {
        await fetchSettings();
        if (showToast) showToast(res.message || "Đã khôi phục về mặc định!", "success");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Không thể khôi phục mặc định.", "error");
    } finally {
      setResetting(false);
    }
  };

  const handleUseCurrentGps = () => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setConfig((prev) => ({
            ...prev,
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6))
          }));
          if (showToast) {
            showToast("Đã lấy tọa độ GPS tại vị trí hiện tại! Hãy bấm Lưu Cấu Hình.", "info");
          }
        },
        () => {
          if (showToast) showToast("Không thể lấy tọa độ từ thiết bị.", "warning");
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  };

  return (
    <form onSubmit={handleSaveAll} className="space-y-5 max-w-4xl pb-6">
      {/* Thanh Tiêu Đề & Nút Lưu Nhanh */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Trung Tâm Cấu Hình Động Doanh Nghiệp (V5 Dynamic Engine)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mọi thay đổi được áp dụng tức thời cho bộ máy Chấm công 1 chạm & Tính lương tự động
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={resetting || saving}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Khôi phục mặc định</span>
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-blue-600/30 transition"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Đang lưu..." : "Lưu Toàn Bộ Cấu Hình"}</span>
          </button>
        </div>
      </div>

      {/* CARD 1: KHUNG GIỜ LÀM VIỆC CHUẨN (SÁNG / NGHỈ TRƯA / CHIỀU) */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="border-b border-slate-700/60 pb-3">
          <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            1. Khung Giờ Làm Việc & Nghỉ Trưa Chuẩn
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Hệ thống tự động đối chiếu giờ Vào ca / Ra ca và trừ thời gian nghỉ trưa khi tính công & tăng ca
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Giờ Vào Làm Sáng</label>
            <input
              type="time"
              value={config.work_start}
              onChange={(e) => setConfig({ ...config, work_start: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Bắt Đầu Nghỉ Trưa</label>
            <input
              type="time"
              value={config.lunch_start}
              onChange={(e) => setConfig({ ...config, lunch_start: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Kết Thúc Nghỉ Trưa</label>
            <input
              type="time"
              value={config.lunch_end}
              onChange={(e) => setConfig({ ...config, lunch_end: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Giờ Tan Ca Chiều</label>
            <input
              type="time"
              value={config.work_end}
              onChange={(e) => setConfig({ ...config, work_end: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
        </div>
      </div>

      {/* CARD 2: QUY TẮC NGÀY CÔNG CHUẨN, THỬ VIỆC & XỬ PHẠT ĐI MUỘN */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="border-b border-slate-700/60 pb-3">
          <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            2. Định Mức Ngày Công, Lương Thử Việc & Quy Tắc Đi Muộn
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Số Ngày Công Chuẩn/Tháng</label>
            <input
              type="number"
              step="0.5"
              min={1}
              max={31}
              value={config.standard_work_days}
              onChange={(e) => setConfig({ ...config, standard_work_days: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Tỷ Lệ Lương Thử Việc (%)</label>
            <input
              type="number"
              min={50}
              max={100}
              value={config.probation_salary_percent}
              onChange={(e) => setConfig({ ...config, probation_salary_percent: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Ân Hạn Đi Trễ (Phút)</label>
            <input
              type="number"
              min={0}
              max={60}
              value={config.grace_period_minutes}
              onChange={(e) => setConfig({ ...config, grace_period_minutes: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Mức Phạt Đi Trễ (VND/Phút)</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={config.penalty_per_minute}
              onChange={(e) => setConfig({ ...config, penalty_per_minute: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
        </div>
      </div>

      {/* CARD 3: HỆ SỐ LÀM THÊM GIỜ (OT) & TRÍCH ĐÓNG BẢO HIỂM (BHXH) */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="border-b border-slate-700/60 pb-3">
          <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            3. Hệ Số Lương Tăng Ca (OT) & Tỷ Lệ Khấu Trừ Bảo Hiểm
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Tự động đồng bộ vào động cơ tính lương `payrollCalculator.js`
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">OT Ngày Thường (x)</label>
            <input
              type="number"
              step="0.1"
              min={1}
              value={config.ot_rate_weekday}
              onChange={(e) => setConfig({ ...config, ot_rate_weekday: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">OT Chủ Nhật (x)</label>
            <input
              type="number"
              step="0.1"
              min={1}
              value={config.ot_rate_weekend}
              onChange={(e) => setConfig({ ...config, ot_rate_weekend: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">OT Ngày Lễ (x)</label>
            <input
              type="number"
              step="0.1"
              min={1}
              value={config.ot_rate_holiday}
              onChange={(e) => setConfig({ ...config, ot_rate_holiday: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Đơn Giá OT Cố Định (0=Tự động)</label>
            <input
              type="number"
              step={5000}
              min={0}
              value={config.custom_ot_hourly_rate}
              onChange={(e) => setConfig({ ...config, custom_ot_hourly_rate: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Trích BHXH NV (%)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={35}
              value={config.insurance_rate}
              onChange={(e) => setConfig({ ...config, insurance_rate: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
        </div>
      </div>

      {/* CARD 4: TỌA ĐỘ GPS TRỤ SỞ & BÁN KÍNH GEOFENCE */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              4. Tọa Độ GPS Trụ Sở, Bán Kính Chấm Công & Chu Kỳ Xóa Log
            </h3>
          </div>
          <button
            type="button"
            onClick={fetchSettings}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white rounded-xl"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Tên Pháp Lý Doanh Nghiệp</label>
            <input
              type="text"
              value={config.company_name}
              onChange={(e) => setConfig({ ...config, company_name: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Địa Chỉ Trụ Sở / Nhà Máy</label>
            <input
              type="text"
              value={config.address}
              onChange={(e) => setConfig({ ...config, address: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Vĩ Độ (Latitude)</label>
            <input
              type="number"
              step="any"
              value={config.latitude}
              onChange={(e) => setConfig({ ...config, latitude: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Kinh Độ (Longitude)</label>
            <input
              type="number"
              step="any"
              value={config.longitude}
              onChange={(e) => setConfig({ ...config, longitude: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Bán Kính (Mét)</label>
            <input
              type="number"
              min={10}
              max={10000}
              value={config.radius_meters}
              onChange={(e) => setConfig({ ...config, radius_meters: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Lưu Nhật Ký (Ngày)</label>
            <input
              type="number"
              min={7}
              max={365}
              value={config.log_retention_days}
              onChange={(e) => setConfig({ ...config, log_retention_days: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold"
            />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUseCurrentGps}
              className="min-h-[40px] px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-blue-300 font-bold text-xs rounded-xl border border-slate-600 flex items-center gap-1.5 transition"
            >
              <Compass className="w-4 h-4 text-blue-400" />
              <span>Lấy GPS Vị Trí Hiện Tại</span>
            </button>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, radius_meters: 5000 }))}
              className="min-h-[40px] px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/30 transition"
            >
              Đặt Bán Kính 5000m (Pilot Test)
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Đang lưu cấu hình..." : "Lưu Toàn Bộ Cấu Hình V5"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
