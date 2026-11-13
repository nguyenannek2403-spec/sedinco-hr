import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Clock,
  MapPin,
  Calculator,
  Wifi,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Navigation,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
} from "lucide-react";
import { safeGet, safePut, safePost, generateIdempotencyKey } from "../../utils/api";

const toNum = (val, fallback) => {
  if (val === "" || val === null || val === undefined) return fallback;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const AccordionSection = ({
  id,
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-blue-600",
  iconBg = "bg-blue-50",
  isOpen,
  onToggle,
  children,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50/70 active:bg-slate-100/70 transition-colors min-h-[64px]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-slate-800 truncate">{title}</h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>
    </button>
    {isOpen && (
      <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-4">
        {children}
      </div>
    )}
  </div>
);

export default function CompanySettingsTab({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWifi, setSavingWifi] = useState(false);
  const [resetting, setResetting] = useState(false);
  const savingRef = useRef(false);
  const savingWifiRef = useRef(false);
  const resettingRef = useRef(false);
  const [detectingLocIdx, setDetectingLocIdx] = useState(null);
  const [statusBanner, setStatusBanner] = useState(null);
  const [openSections, setOpenSections] = useState({
    schedule: true,
    locations: false,
    payroll: false,
  });

  const [config, setConfig] = useState({
    company_name: "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
    phone: "",
    address: "",
    tax_code: "",
    work_start: "08:00",
    lunch_start: "12:00",
    lunch_end: "13:30",
    work_end: "17:30",
    grace_period_minutes: 15,
    penalty_per_minute: 2000,
    penalty_fixed_block: 50000,
    penalty_salary_percent: 0,
    standard_work_days: 26,
    probation_salary_percent: 85,
    ot_rate_weekday: 1.5,
    ot_rate_weekend: 2.0,
    ot_rate_holiday: 3.0,
    custom_ot_hourly_rate: 0,
    insurance_rate: 10.5,
    log_retention_days: 30,
    office_ip_whitelist: "",
    announcement_text: "",
    announcement_updated_at: null,
    current_client_ip: "",
    is_matching_office_wifi: false,
    allowed_locations: [
      {
        id: "loc_hq_1",
        name: "Trụ sở chính Đà Nẵng",
        lat: 16.0544,
        lng: 108.2022,
        radius: 500,
      },
    ],
  });

  const notify = useCallback(
    (msg, type = "success") => {
      setStatusBanner({ msg, type });
      if (typeof showToast === "function") {
        showToast(msg, type);
      }
      setTimeout(() => {
        setStatusBanner((prev) => (prev?.msg === msg ? null : prev));
      }, 4500);
    },
    [showToast]
  );

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeGet("/company", {}, { cancelPrevious: false });
      const data = res?.data || res;
      if (data && typeof data === "object") {
        setConfig((prev) => ({
          ...prev,
          ...data,
          allowed_locations:
            Array.isArray(data.allowed_locations) && data.allowed_locations.length > 0
              ? data.allowed_locations
              : prev.allowed_locations,
        }));
      }
    } catch (err) {
      notify(err?.message || "Không thể tải cài đặt công ty", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateField = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleLocationChange = (idx, field, value) => {
    setConfig((prev) => {
      const next = [...(prev.allowed_locations || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, allowed_locations: next };
    });
  };

  const handleAddLocation = () => {
    setConfig((prev) => ({
      ...prev,
      allowed_locations: [
        ...(prev.allowed_locations || []),
        {
          id: `loc_${Date.now()}`,
          name: `Chi nhánh / Công trình ${(prev.allowed_locations?.length || 0) + 1}`,
          lat: 16.0544,
          lng: 108.2022,
          radius: 300,
        },
      ],
    }));
  };

  const handleRemoveLocation = (idx) => {
    setConfig((prev) => {
      const list = prev.allowed_locations || [];
      if (list.length <= 1) {
        notify("Cần giữ lại ít nhất 1 địa điểm chấm công!", "error");
        return prev;
      }
      return {
        ...prev,
        allowed_locations: list.filter((_, i) => i !== idx),
      };
    });
  };

  const handleUseCurrentGps = (idx) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      notify("Thiết bị không hỗ trợ định vị vị trí hiện tại.", "error");
      return;
    }
    setDetectingLocIdx(idx);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setConfig((prev) => {
          const next = [...(prev.allowed_locations || [])];
          next[idx] = { ...next[idx], lat, lng };
          return { ...prev, allowed_locations: next };
        });
        setDetectingLocIdx(null);
        notify("Đã cập nhật tọa độ theo vị trí bạn đang đứng!");
      },
      () => {
        setDetectingLocIdx(null);
        notify("Không thể lấy vị trí. Hãy kiểm tra quyền truy cập vị trí trên điện thoại.", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveWifiIp = async () => {
    if (savingWifiRef.current) return;
    savingWifiRef.current = true;
    setSavingWifi(true);
    try {
      const res = await safePost("/company/save-wifi-ip", {}, {
        idempotencyKey: generateIdempotencyKey("comp_wifi")
      });
      if (res?.data) {
        setConfig((prev) => ({ ...prev, ...res.data }));
      }
      notify(res?.message || "Đã lưu mạng Wi-Fi công ty thành công!");
    } catch (err) {
      notify(err?.message || "Không thể lưu mạng Wi-Fi hiện tại", "error");
    } finally {
      savingWifiRef.current = false;
      setSavingWifi(false);
    }
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const cleanedLocations = (config.allowed_locations || []).map((loc, idx) => ({
        id: loc.id || `loc_${idx + 1}`,
        name: String(loc.name || `Địa điểm ${idx + 1}`).trim(),
        lat: toNum(loc.lat, 16.0544),
        lng: toNum(loc.lng, 108.2022),
        radius: Math.max(20, Math.round(toNum(loc.radius, 300))),
      }));

      const primary = cleanedLocations[0] || { lat: 16.0544, lng: 108.2022, radius: 500 };

      const payload = {
        company_name: String(config.company_name || "").trim() || "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
        phone: config.phone ? String(config.phone).trim() : "",
        address: config.address ? String(config.address).trim() : "",
        tax_code: config.tax_code ? String(config.tax_code).trim() : "",
        work_start: config.work_start || "08:00",
        lunch_start: config.lunch_start || "12:00",
        lunch_end: config.lunch_end || "13:30",
        work_end: config.work_end || "17:30",
        grace_period_minutes: Math.max(0, Math.round(toNum(config.grace_period_minutes, 15))),
        penalty_per_minute: Math.max(0, toNum(config.penalty_per_minute, 2000)),
        penalty_fixed_block: Math.max(0, toNum(config.penalty_fixed_block, 50000)),
        penalty_salary_percent: Math.max(0, toNum(config.penalty_salary_percent, 0)),
        standard_work_days: Math.max(1, toNum(config.standard_work_days, 26)),
        probation_salary_percent: Math.min(100, Math.max(0, toNum(config.probation_salary_percent, 85))),
        ot_rate_weekday: Math.max(0, toNum(config.ot_rate_weekday, 1.5)),
        ot_rate_weekend: Math.max(0, toNum(config.ot_rate_weekend, 2.0)),
        ot_rate_holiday: Math.max(0, toNum(config.ot_rate_holiday, 3.0)),
        custom_ot_hourly_rate: Math.max(0, toNum(config.custom_ot_hourly_rate, 0)),
        insurance_rate: Math.max(0, toNum(config.insurance_rate, 10.5)),
        log_retention_days: Math.max(1, Math.round(toNum(config.log_retention_days, 30))),
        office_ip_whitelist: String(config.office_ip_whitelist || "").trim(),
        announcement_text: String(config.announcement_text || "").trim(),
        allowed_locations: cleanedLocations,
        latitude: primary.lat,
        longitude: primary.lng,
        radius_meters: primary.radius,
      };

      const res = await safePut("/company", payload, {
        idempotencyKey: generateIdempotencyKey("comp_save")
      });
      if (res?.data) {
        setConfig((prev) => ({
          ...prev,
          ...res.data,
          allowed_locations:
            Array.isArray(res.data.allowed_locations) && res.data.allowed_locations.length > 0
              ? res.data.allowed_locations
              : cleanedLocations,
        }));
      }
      notify(res?.message || "Đã lưu cấu hình công ty thành công!");
    } catch (err) {
      notify(err?.message || "Lỗi khi lưu cấu hình. Vui lòng thử lại!", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (resettingRef.current) return;
    resettingRef.current = true;
    setResetting(true);
    try {
      const res = await safePost("/company/reset-defaults", {}, {
        idempotencyKey: generateIdempotencyKey("comp_reset")
      });
      if (res?.data) {
        setConfig((prev) => ({
          ...prev,
          ...res.data,
          allowed_locations:
            Array.isArray(res.data.allowed_locations) && res.data.allowed_locations.length > 0
              ? res.data.allowed_locations
              : prev.allowed_locations,
        }));
      }
      notify("Đã khôi phục toàn bộ cài đặt về mức chuẩn ban đầu!");
    } catch (err) {
      notify(err?.message || "Không thể khôi phục mặc định", "error");
    } finally {
      resettingRef.current = false;
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-medium">Đang tải cài đặt công ty...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-28 space-y-4">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-snug">Cài đặt Công ty & Chấm công</h2>
            <p className="text-xs text-blue-100 mt-0.5">
              Chọn từng mục bên dưới để điều chỉnh giờ làm, địa điểm và quy tắc tính lương.
            </p>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-sm font-medium ${
            statusBanner.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {statusBanner.type === "error" ? (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span>{statusBanner.msg}</span>
        </div>
      )}

      {/* F4: Bảng tin Thông báo Nội bộ */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-amber-950">📢 Bảng tin thông báo nội bộ</h3>
            <p className="text-xs text-amber-800/80 mt-0.5">
              Hiển thị nổi bật ngay đầu màn hình chấm công của toàn bộ công nhân.
            </p>
          </div>
          {config.announcement_text && (
            <button
              type="button"
              onClick={() => updateField("announcement_text", "")}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
            >
              Xóa thông báo
            </button>
          )}
        </div>
        <textarea
          rows={3}
          value={config.announcement_text || ""}
          onChange={(e) => updateField("announcement_text", e.target.value)}
          placeholder="VD: Thứ 7 tuần này công trình A nghỉ bảo trì điện, anh em ca chiều chuyển sang kho B lúc 13:00..."
          className="w-full p-3 rounded-xl border border-amber-300 bg-white text-sm text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Mục 1: Giờ làm việc & Nghỉ trưa */}
      <AccordionSection
        id="schedule"
        title="1. Giờ làm việc & Nghỉ trưa"
        subtitle={`${config.work_start || "08:00"} – ${config.work_end || "17:30"} • Nghỉ trưa ${config.lunch_start || "12:00"} – ${config.lunch_end || "13:30"}`}
        icon={Clock}
        iconColor="text-blue-600"
        iconBg="bg-blue-50"
        isOpen={openSections.schedule}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Giờ bắt đầu làm
            </label>
            <input
              type="time"
              value={config.work_start || "08:00"}
              onChange={(e) => updateField("work_start", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Giờ tan ca
            </label>
            <input
              type="time"
              value={config.work_end || "17:30"}
              onChange={(e) => updateField("work_end", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Bắt đầu nghỉ trưa
            </label>
            <input
              type="time"
              value={config.lunch_start || "12:00"}
              onChange={(e) => updateField("lunch_start", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Kết thúc nghỉ trưa
            </label>
            <input
              type="time"
              value={config.lunch_end || "13:30"}
              onChange={(e) => updateField("lunch_end", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Thời gian đi muộn được châm chước (phút)
          </label>
          <input
            type="number"
            min="0"
            value={config.grace_period_minutes ?? 15}
            onChange={(e) => updateField("grace_period_minutes", e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Ví dụ: nhập 15 nghĩa là nhân viên vào trễ trong vòng 15 phút đầu vẫn được tính đúng giờ.
          </p>
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Tên công ty hiển thị trên phiếu lương
            </label>
            <input
              type="text"
              value={config.company_name || ""}
              onChange={(e) => updateField("company_name", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                value={config.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="Ví dụ: 0236 3888 999"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Địa chỉ trụ sở
              </label>
              <input
                type="text"
                value={config.address || ""}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Nhập địa chỉ công ty"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Mục 2: Địa điểm chấm công & Wi-Fi công ty */}
      <AccordionSection
        id="locations"
        title="2. Địa điểm chấm công & Wi-Fi công ty"
        subtitle={`${config.allowed_locations?.length || 1} địa điểm được phép chấm công`}
        icon={MapPin}
        iconColor="text-emerald-600"
        iconBg="bg-emerald-50"
        isOpen={openSections.locations}
        onToggle={toggleSection}
      >
        <div className="space-y-3">
          {(config.allowed_locations || []).map((loc, idx) => (
            <div
              key={loc.id || idx}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  Địa điểm #{idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUseCurrentGps(idx)}
                    disabled={detectingLocIdx === idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold active:scale-95 disabled:opacity-60 min-h-[36px]"
                  >
                    {detectingLocIdx === idx ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5" />
                    )}
                    Lấy vị trí tôi đang đứng
                  </button>
                  {(config.allowed_locations || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLocation(idx)}
                      className="w-9 h-9 rounded-lg border border-red-200 bg-white text-red-600 flex items-center justify-center hover:bg-red-50"
                      aria-label="Xóa địa điểm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Tên văn phòng / Kho bãi / Công trình
                </label>
                <input
                  type="text"
                  value={loc.name || ""}
                  onChange={(e) => handleLocationChange(idx, "name", e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Vĩ độ
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={loc.lat ?? ""}
                    onChange={(e) => handleLocationChange(idx, "lat", e.target.value)}
                    className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Kinh độ
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={loc.lng ?? ""}
                    onChange={(e) => handleLocationChange(idx, "lng", e.target.value)}
                    className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Bán kính (mét)
                  </label>
                  <input
                    type="number"
                    min="20"
                    value={loc.radius ?? 300}
                    onChange={(e) => handleLocationChange(idx, "radius", e.target.value)}
                    className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddLocation}
            className="w-full h-11 rounded-xl border border-dashed border-emerald-400 bg-emerald-50/50 text-emerald-700 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-50"
          >
            <Plus className="w-4 h-4" />
            Thêm chi nhánh / công trình mới
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-blue-800 font-bold text-xs">
              <Wifi className="w-4 h-4" />
              <span>Chấm công nhanh bằng Wi-Fi công ty</span>
            </div>
            <button
              type="button"
              onClick={handleSaveWifiIp}
              disabled={savingWifi}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 min-h-[36px] disabled:opacity-60"
            >
              {savingWifi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              Lưu Wi-Fi đang kết nối
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Địa chỉ mạng hiện tại của bạn:{" "}
            <strong className="text-slate-800">{config.current_client_ip || "Đang xác định"}</strong>
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Danh sách địa chỉ mạng Wi-Fi hợp lệ (cách nhau bởi dấu phẩy)
            </label>
            <input
              type="text"
              value={config.office_ip_whitelist || ""}
              onChange={(e) => updateField("office_ip_whitelist", e.target.value)}
              placeholder="Bấm nút Lưu Wi-Fi đang kết nối để tự điền"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </AccordionSection>

      {/* Mục 3: Quy tắc tính công, Tăng ca & Bảo hiểm */}
      <AccordionSection
        id="payroll"
        title="3. Quy tắc tính công, Tăng ca & Bảo hiểm"
        subtitle={`Công chuẩn ${config.standard_work_days || 26} ngày • Bảo hiểm ${config.insurance_rate ?? 10.5}%`}
        icon={Calculator}
        iconColor="text-violet-600"
        iconBg="bg-violet-50"
        isOpen={openSections.payroll}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Số ngày công chuẩn trong tháng
            </label>
            <input
              type="number"
              min="1"
              step="0.5"
              value={config.standard_work_days ?? 26}
              onChange={(e) => updateField("standard_work_days", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Mức hưởng lương thử việc (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.probation_salary_percent ?? 85}
              onChange={(e) => updateField("probation_salary_percent", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Tỷ lệ đóng bảo hiểm người lao động (%)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.insurance_rate ?? 10.5}
              onChange={(e) => updateField("insurance_rate", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Đơn giá tăng ca cố định / giờ (VNĐ)
            </label>
            <input
              type="number"
              min="0"
              value={config.custom_ot_hourly_rate ?? 0}
              onChange={(e) => updateField("custom_ot_hourly_rate", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Nhập 0 nếu tính theo hệ số bên dưới.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Hệ số ngày thường
            </label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={config.ot_rate_weekday ?? 1.5}
              onChange={(e) => updateField("ot_rate_weekday", e.target.value)}
              className="w-full h-10 px-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Hệ số cuối tuần
            </label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={config.ot_rate_weekend ?? 2.0}
              onChange={(e) => updateField("ot_rate_weekend", e.target.value)}
              className="w-full h-10 px-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Hệ số ngày lễ
            </label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={config.ot_rate_holiday ?? 3.0}
              onChange={(e) => updateField("ot_rate_holiday", e.target.value)}
              className="w-full h-10 px-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Tiền phạt đi muộn mỗi phút (VNĐ)
            </label>
            <input
              type="number"
              min="0"
              value={config.penalty_per_minute ?? 2000}
              onChange={(e) => updateField("penalty_per_minute", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Lưu lịch sử hoạt động (ngày)
            </label>
            <input
              type="number"
              min="7"
              value={config.log_retention_days ?? 30}
              onChange={(e) => updateField("log_retention_days", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800"
            />
          </div>
        </div>
      </AccordionSection>

      {/* Thanh hành động cố định bên dưới */}
      <div
        className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 -mx-2 px-3 py-3 rounded-t-2xl shadow-lg flex items-center justify-between gap-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <button
          type="button"
          onClick={handleResetDefaults}
          disabled={resetting || saving}
          className="h-11 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-slate-50 active:scale-95 disabled:opacity-60"
        >
          {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          Khôi phục mặc định
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || resetting}
          className="flex-1 sm:flex-none h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-blue-700 active:scale-95 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu cấu hình
        </button>
      </div>
    </div>
  );
}
