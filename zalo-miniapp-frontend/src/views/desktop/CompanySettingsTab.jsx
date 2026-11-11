import React, { useState, useEffect, useCallback } from "react";
import { Building, MapPin, Compass, AlertTriangle, Save, RefreshCw, CheckCircle2 } from "lucide-react";
import { safeGet, safePut, safePost } from "../../utils/api";

export default function CompanySettingsTab({ currentUser, showToast }) {
  const [company, setCompany] = useState({
    name: "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
    address: "Khu Công Nghiệp Hòa Khánh, Liên Chiểu, Đà Nẵng",
    latitude: 16.0544,
    longitude: 108.2022,
    geofence_radius: 100
  });

  const [penalties, setPenalties] = useState({
    penalty_type: "fixed_amount",
    tier_15_30_amount: 20000,
    tier_31_60_amount: 50000,
    tier_61_120_amount: 100000
  });

  const [loading, setLoading] = useState(false);
  const [savingGps, setSavingGps] = useState(false);
  const [savingPenalties, setSavingPenalties] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, penRes] = await Promise.all([
        safeGet("/company"),
        safeGet("/company/penalties")
      ]);
      if (compRes?.success && compRes.data) {
        setCompany(compRes.data);
      }
      if (penRes?.success && penRes.data) {
        setPenalties(penRes.data);
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

  const handleSaveGps = async (e) => {
    e.preventDefault();
    setSavingGps(true);
    try {
      const res = await safePut("/company", {
        name: company.name,
        address: company.address,
        latitude: Number(company.latitude),
        longitude: Number(company.longitude),
        geofence_radius: Number(company.geofence_radius)
      });
      if (res?.success) {
        if (showToast) showToast("Đã lưu tọa độ GPS & Bán kính Geofence thành công!", "success");
      } else {
        alert(res?.message || "Không thể cập nhật cấu hình công ty.");
      }
    } catch (err) {
      alert(err.message || "Lỗi lưu cấu hình GPS.");
    } finally {
      setSavingGps(false);
    }
  };

  const handleSavePenalties = async (e) => {
    e.preventDefault();
    setSavingPenalties(true);
    try {
      const res = await safePost("/company/penalties", penalties);
      if (res?.success) {
        if (showToast) showToast("Đã lưu quy tắc phạt đi muộn / về sớm thành công!", "success");
      } else {
        alert(res?.message || "Không thể cập nhật mức phạt.");
      }
    } catch (err) {
      alert(err.message || "Lỗi lưu mức phạt.");
    } finally {
      setSavingPenalties(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* GPS Geofence Settings */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              Tọa Độ Nhà Máy & Bán Kính Chấm Công (Geofence)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chỉ cho phép chấm công khi thiết bị của công nhân nằm trong bán kính hợp lệ
            </p>
          </div>
          <button
            onClick={fetchSettings}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>

        <form onSubmit={handleSaveGps} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Tên Đơn Vị</label>
              <input
                type="text"
                value={company.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Địa Chỉ Thực Địa</label>
              <input
                type="text"
                value={company.address}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Vĩ Độ (Latitude)</label>
              <input
                type="number"
                step="any"
                value={company.latitude}
                onChange={(e) => setCompany({ ...company, latitude: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Kinh Độ (Longitude)</label>
              <input
                type="number"
                step="any"
                value={company.longitude}
                onChange={(e) => setCompany({ ...company, longitude: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Bán Kính Geofence (Mét)</label>
              <input
                type="number"
                min={10}
                max={5000}
                value={company.geofence_radius}
                onChange={(e) => setCompany({ ...company, geofence_radius: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingGps}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingGps ? "Đang lưu..." : "Lưu Cấu Hình GPS"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Penalties Settings */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="border-b border-slate-700/60 pb-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Quy Tắc Xử Phạt Đi Muộn & Về Sớm
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Áp dụng tự động khi công nhân chấm công sau 08:00 hoặc trước 17:00
          </p>
        </div>

        <form onSubmit={handleSavePenalties} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Đi trễ 15 - 30 phút</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={penalties.tier_15_30_amount}
                  onChange={(e) => setPenalties({ ...penalties, tier_15_30_amount: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">đ</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Đi trễ 31 - 60 phút</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={penalties.tier_31_60_amount}
                  onChange={(e) => setPenalties({ ...penalties, tier_31_60_amount: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">đ</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Đi trễ 61 - 120 phút</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={penalties.tier_61_120_amount}
                  onChange={(e) => setPenalties({ ...penalties, tier_61_120_amount: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">đ</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingPenalties}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingPenalties ? "Đang lưu..." : "Lưu Quy Tắc Phạt"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
