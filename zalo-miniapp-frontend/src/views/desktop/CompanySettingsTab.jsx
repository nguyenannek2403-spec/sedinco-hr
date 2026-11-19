import React, { useState, useEffect, useCallback } from "react";
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
  Building2,
} from "lucide-react";
import { safeGet, safePut, safePost, generateIdempotencyKey } from "../../utils/api";
import { zmpAdapter } from "../../adapters/zmp/sdkAdapter";
import { formatViNumber, parseViNumberInput } from "../../utils/viNumberFormat";
import { AppButton, FormRow, SkeletonList } from "../../components/ui";

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
  iconColor = "text-blue-600 dark:text-blue-300",
  iconBg = "bg-blue-50 dark:bg-blue-950/60",
  isOpen,
  onToggle,
  children,
}) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-all">
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="w-full flex items-center justify-between gap-[10px] p-[14px] sm:p-4 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/60 active:bg-slate-100/70 dark:active:bg-slate-800 transition-colors min-h-[64px]"
    >
      <div className="flex items-center gap-[10px] min-w-0 flex-1">
        <div
          className={`w-[38px] h-[38px] rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}
        >
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 leading-snug break-words mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="w-[34px] h-[34px] rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>
    </button>
    {isOpen && (
      <div className="px-[14px] sm:px-4 pb-[14px] sm:pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
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
    late_policy_type: "PER_MINUTE",
    free_late_occurrences: 3,
    late_penalty_per_minute: 2000,
    late_penalty_amount: 50000,
    max_late_minutes_for_half_day: 60,
    standard_work_days: 26,
    probation_salary_percent: 85,
    probation_allowance_full: 1,
    ot_rate_weekday: 1.5,
    ot_rate_weekend: 2.0,
    ot_rate_holiday: 3.0,
    custom_ot_hourly_rate: 0,
    ot_calculation_mode: "APPROVED_OR_AUTO",
    free_late_exempts_halfday: 0,
    negative_salary_policy: "CLAMP_ZERO",
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

  const handleUseCurrentGps = async (idx) => {
    setDetectingLocIdx(idx);
    try {
      const pos = await zmpAdapter.getLocation();
      const rawLat = Number(pos?.latitude);
      const rawLng = Number(pos?.longitude);
      if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
        notify("Thiết bị chưa trả về được tọa độ vị trí hiện tại. Vui lòng nhập tay hoặc thử lại.", "error");
        return;
      }
      const lat = Number(rawLat.toFixed(6));
      const lng = Number(rawLng.toFixed(6));
      setConfig((prev) => {
        const next = [...(prev.allowed_locations || [])];
        next[idx] = { ...next[idx], lat, lng };
        return { ...prev, allowed_locations: next };
      });
      notify("Đã cập nhật tọa độ theo vị trí bạn đang đứng!");
    } catch (err) {
      notify(err?.message || "Không thể lấy vị trí. Hãy kiểm tra quyền truy cập vị trí trên thiết bị.", "error");
    } finally {
      setDetectingLocIdx(null);
    }
  };

  const handleSaveWifiIp = async () => {
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
      setSavingWifi(false);
    }
  };

  const handleSave = async () => {
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
        penalty_per_minute: Math.max(0, toNum(config.late_penalty_per_minute ?? config.penalty_per_minute, 2000)),
        penalty_fixed_block: Math.max(0, toNum(config.late_penalty_amount ?? config.penalty_fixed_block, 50000)),
        penalty_salary_percent: Math.max(0, toNum(config.penalty_salary_percent, 0)),
        late_policy_type: config.late_policy_type || "PER_MINUTE",
        free_late_occurrences: Math.max(0, Math.round(toNum(config.free_late_occurrences, 3))),
        late_penalty_per_minute: Math.max(0, toNum(config.late_penalty_per_minute ?? config.penalty_per_minute, 2000)),
        late_penalty_amount: Math.max(0, toNum(config.late_penalty_amount ?? config.penalty_fixed_block, 50000)),
        max_late_minutes_for_half_day: Math.max(1, Math.round(toNum(config.max_late_minutes_for_half_day, 60))),
        standard_work_days: Math.max(1, toNum(config.standard_work_days, 26)),
        probation_salary_percent: Math.min(100, Math.max(0, toNum(config.probation_salary_percent, 85))),
        probation_allowance_full: config.probation_allowance_full === 0 || config.probation_allowance_full === false || String(config.probation_allowance_full) === "0" ? 0 : 1,
        ot_rate_weekday: Math.max(0, toNum(config.ot_rate_weekday, 1.5)),
        ot_rate_weekend: Math.max(0, toNum(config.ot_rate_weekend, 2.0)),
        ot_rate_holiday: Math.max(0, toNum(config.ot_rate_holiday, 3.0)),
        custom_ot_hourly_rate: Math.max(0, toNum(config.custom_ot_hourly_rate, 0)),
        ot_calculation_mode: config.ot_calculation_mode || "APPROVED_OR_AUTO",
        free_late_exempts_halfday: Number(config.free_late_exempts_halfday) ? 1 : 0,
        negative_salary_policy: config.negative_salary_policy || "CLAMP_ZERO",
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
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
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
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-4">
        <SkeletonList rows={4} label="Đang tải cài đặt công ty..." />
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
              ? "bg-red-50 dark:bg-rose-950/60 border-red-200 dark:border-rose-800/70 text-red-700 dark:text-rose-300"
              : "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300"
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
      <div className="bg-amber-50/80 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 rounded-2xl p-4 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">📢 Bảng tin thông báo nội bộ</h3>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/90 mt-0.5">
              Hiển thị nổi bật ngay đầu màn hình chấm công của toàn bộ công nhân.
            </p>
          </div>
          {config.announcement_text && (
            <button
              type="button"
              onClick={() => updateField("announcement_text", "")}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/60 whitespace-nowrap shrink-0"
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
          className="w-full p-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Mục 1: Giờ làm việc & Nghỉ trưa */}
      <AccordionSection
        id="schedule"
        title="1. Giờ làm việc & Nghỉ trưa"
        subtitle={`${config.work_start || "08:00"} – ${config.work_end || "17:30"} • Nghỉ trưa ${config.lunch_start || "12:00"} – ${config.lunch_end || "13:30"}`}
        icon={Clock}
        iconColor="text-blue-600 dark:text-blue-300"
        iconBg="bg-blue-50 dark:bg-blue-950/60"
        isOpen={openSections.schedule}
        onToggle={toggleSection}
      >
        <div className="divide-y divide-slate-100 dark:divide-slate-700/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl bg-slate-50/70 dark:bg-slate-800/70 overflow-hidden">
          <FormRow label="Giờ bắt đầu làm việc">
            <input
              type="time"
              value={config.work_start || "08:00"}
              onChange={(e) => updateField("work_start", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-blue-500 focus:outline-none"
            />
          </FormRow>
          <FormRow label="Giờ tan ca">
            <input
              type="time"
              value={config.work_end || "17:30"}
              onChange={(e) => updateField("work_end", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-blue-500 focus:outline-none"
            />
          </FormRow>
          <FormRow label="Bắt đầu nghỉ trưa">
            <input
              type="time"
              value={config.lunch_start || "12:00"}
              onChange={(e) => updateField("lunch_start", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-blue-500 focus:outline-none"
            />
          </FormRow>
          <FormRow label="Kết thúc nghỉ trưa">
            <input
              type="time"
              value={config.lunch_end || "13:30"}
              onChange={(e) => updateField("lunch_end", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-blue-500 focus:outline-none"
            />
          </FormRow>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Thời gian đi muộn được châm chước (phút)
          </label>
          <input
            type="number"
            min="0"
            value={config.grace_period_minutes ?? 15}
            onChange={(e) => updateField("grace_period_minutes", e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ví dụ: nhập 15 nghĩa là nhân viên vào trễ trong vòng 15 phút đầu vẫn được tính đúng giờ.
          </p>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Tên công ty hiển thị trên phiếu lương
            </label>
            <input
              type="text"
              value={config.company_name || ""}
              onChange={(e) => updateField("company_name", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                value={config.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="Ví dụ: 0236 3888 999"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Địa chỉ trụ sở
              </label>
              <input
                type="text"
                value={config.address || ""}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Nhập địa chỉ công ty"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
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
        iconColor="text-emerald-600 dark:text-emerald-300"
        iconBg="bg-emerald-50 dark:bg-emerald-950/60"
        isOpen={openSections.locations}
        onToggle={toggleSection}
      >
        <div className="space-y-3">
          {(config.allowed_locations || []).map((loc, idx) => (
            <div
              key={loc.id || idx}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/70 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Địa điểm #{idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  <AppButton
                    variant="success"
                    icon={Navigation}
                    loading={detectingLocIdx === idx}
                    onClick={() => handleUseCurrentGps(idx)}
                    className="text-xs px-3 py-2"
                  >
                    Lấy vị trí tôi đang đứng
                  </AppButton>
                  {(config.allowed_locations || []).length > 1 && (
                    <AppButton
                      variant="ghost"
                      onClick={() => handleRemoveLocation(idx)}
                      className="min-w-[44px] min-h-[44px] px-2.5 border border-red-200 dark:border-rose-800/70 bg-white dark:bg-slate-800 text-red-600 dark:text-rose-300 hover:bg-red-50 dark:hover:bg-rose-950/50"
                      aria-label="Xóa địa điểm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AppButton>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tên văn phòng / Kho bãi / Công trình
                </label>
                <input
                  type="text"
                  value={loc.name || ""}
                  onChange={(e) => handleLocationChange(idx, "name", e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Vĩ độ
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={loc.lat ?? ""}
                    onChange={(e) => handleLocationChange(idx, "lat", e.target.value)}
                    className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Kinh độ
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={loc.lng ?? ""}
                    onChange={(e) => handleLocationChange(idx, "lng", e.target.value)}
                    className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Bán kính (mét)
                  </label>
                  <input
                    type="number"
                    min="20"
                    value={loc.radius ?? 300}
                    onChange={(e) => handleLocationChange(idx, "radius", e.target.value)}
                    className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}

          <AppButton
            variant="ghost"
            fullWidth
            icon={Plus}
            onClick={handleAddLocation}
            className="border border-dashed border-emerald-400 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/70"
          >
            Thêm chi nhánh / công trình mới
          </AppButton>
        </div>

        <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/70 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-xs">
              <Wifi className="w-4 h-4" />
              <span>Chấm công nhanh bằng Wi-Fi công ty</span>
            </div>
            <AppButton
              variant="primary"
              icon={Wifi}
              loading={savingWifi}
              onClick={handleSaveWifiIp}
              className="text-xs px-3 py-2"
            >
              Lưu Wi-Fi đang kết nối
            </AppButton>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Địa chỉ mạng hiện tại của bạn:{" "}
            <strong className="text-slate-800 dark:text-white">{config.current_client_ip || "Đang xác định"}</strong>
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Danh sách địa chỉ mạng Wi-Fi hợp lệ (cách nhau bởi dấu phẩy)
            </label>
            <input
              type="text"
              value={config.office_ip_whitelist || ""}
              onChange={(e) => updateField("office_ip_whitelist", e.target.value)}
              placeholder="Bấm nút Lưu Wi-Fi đang kết nối để tự điền"
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
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
        iconColor="text-violet-600 dark:text-violet-300"
        iconBg="bg-violet-50 dark:bg-violet-950/60"
        isOpen={openSections.payroll}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Số ngày công chuẩn trong tháng
            </label>
            <input
              type="number"
              min="1"
              step="0.5"
              value={config.standard_work_days ?? 26}
              onChange={(e) => updateField("standard_work_days", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Mức hưởng lương thử việc (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.probation_salary_percent ?? 85}
              onChange={(e) => updateField("probation_salary_percent", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Tỷ lệ đóng bảo hiểm người lao động (%)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.insurance_rate ?? 10.5}
              onChange={(e) => updateField("insurance_rate", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Đơn giá tăng ca cố định / giờ (VNĐ)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={formatViNumber(config.custom_ot_hourly_rate ?? 0, 0)}
              onChange={(e) => updateField("custom_ot_hourly_rate", Math.max(0, Math.round(parseViNumberInput(e.target.value))))}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Nhập 0 nếu tính theo hệ số bên dưới.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Hệ số ngày thường
            </label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={config.ot_rate_weekday ?? 1.5}
              onChange={(e) => updateField("ot_rate_weekday", e.target.value)}
              className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Hệ số cuối tuần
            </label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={config.ot_rate_weekend ?? 2.0}
              onChange={(e) => updateField("ot_rate_weekend", e.target.value)}
              className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Hệ số ngày lễ
            </label>
            <input
              type="number"
              min="1"
              step="0.1"
              value={config.ot_rate_holiday ?? 3.0}
              onChange={(e) => updateField("ot_rate_holiday", e.target.value)}
              className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
            Quy tắc linh hoạt phụ cấp thử việc, tăng ca &amp; khấu trừ
          </h4>
          <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/70 overflow-hidden">
            <FormRow
              label="Phụ cấp & đơn giá tăng ca thử việc"
              description="Áp dụng cho ngày công trước ngày chính thức"
            >
              <select
                value={String(config.probation_allowance_full ?? 1)}
                onChange={(e) => updateField("probation_allowance_full", Number(e.target.value))}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="1">Hưởng đủ 100% phụ cấp &amp; đơn giá tăng ca</option>
                <option value="0">Nhân theo tỷ lệ lương thử việc</option>
              </select>
            </FormRow>
            <FormRow
              label="Chế độ ghi nhận tăng ca"
              description="Kiểm soát điều kiện chi trả giờ tăng ca"
            >
              <select
                value={config.ot_calculation_mode || "APPROVED_OR_AUTO"}
                onChange={(e) => updateField("ot_calculation_mode", e.target.value)}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="APPROVED_OR_AUTO">Ưu tiên đơn duyệt, tự tính theo chấm công</option>
                <option value="REQUIRE_APPROVAL">Bắt buộc có đơn tăng ca đã duyệt</option>
                <option value="AUTO_ACTUAL">Tính đủ theo giờ thực tế chấm công</option>
              </select>
            </FormRow>
            <FormRow
              label="Miễn hạ công khi trễ nặng"
              description="Áp dụng khi bật trừ nửa ngày công"
            >
              <select
                value={String(config.free_late_exempts_halfday ? 1 : 0)}
                onChange={(e) => updateField("free_late_exempts_halfday", Number(e.target.value))}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="0">Không miễn (Vẫn trừ 0.5 công nếu trễ nặng)</option>
                <option value="1">Có miễn trong số lần trễ cho phép</option>
              </select>
            </FormRow>
            <FormRow
              label="Xử lý khi lương thực lĩnh âm"
              description="Khi tổng khấu trừ vượt thu nhập kỳ lương"
            >
              <select
                value={config.negative_salary_policy || "CLAMP_ZERO"}
                onChange={(e) => updateField("negative_salary_policy", e.target.value)}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="CLAMP_ZERO">Giữ 0đ &amp; ghi nhận nợ chuyển kỳ sau</option>
                <option value="SHOW_NEGATIVE">Hiển thị số âm trực tiếp trên phiếu lương</option>
              </select>
            </FormRow>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
            Chính sách xử lý đi trễ & Quy đổi công
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Hình thức xử lý đi trễ
              </label>
              <select
                value={config.late_policy_type || "PER_MINUTE"}
                onChange={(e) => updateField("late_policy_type", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:border-blue-500 focus:outline-none"
              >
                <option value="NONE">Không trừ phạt (Chỉ ghi nhận)</option>
                <option value="PER_MINUTE">Phạt tiền theo số phút đi trễ</option>
                <option value="PER_OCCURRENCE">Phạt tiền cố định mỗi lần đi trễ</option>
                <option value="DEDUCT_WORKDAY">Trừ nửa ngày công nếu trễ quá ngưỡng</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Số lần đi trễ miễn phạt / tháng
              </label>
              <input
                type="number"
                min="0"
                value={config.free_late_occurrences ?? 3}
                onChange={(e) => updateField("free_late_occurrences", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(config.late_policy_type || "PER_MINUTE") === "PER_MINUTE" && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tiền phạt đi trễ mỗi phút (VNĐ)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatViNumber(config.late_penalty_per_minute ?? config.penalty_per_minute ?? 2000, 0)}
                  onChange={(e) => {
                    const num = Math.max(0, Math.round(parseViNumberInput(e.target.value)));
                    updateField("late_penalty_per_minute", num);
                    updateField("penalty_per_minute", num);
                  }}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>
            )}

            {config.late_policy_type === "PER_OCCURRENCE" && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tiền phạt mỗi lần đi trễ (VNĐ)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatViNumber(config.late_penalty_amount ?? config.penalty_fixed_block ?? 50000, 0)}
                  onChange={(e) => {
                    const num = Math.max(0, Math.round(parseViNumberInput(e.target.value)));
                    updateField("late_penalty_amount", num);
                    updateField("penalty_fixed_block", num);
                  }}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>
            )}

            {config.late_policy_type === "DEDUCT_WORKDAY" && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Ngưỡng trễ tính nửa công (phút)
                </label>
                <input
                  type="number"
                  min="1"
                  value={config.max_late_minutes_for_half_day ?? 60}
                  onChange={(e) => updateField("max_late_minutes_for_half_day", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Lưu lịch sử hoạt động (ngày)
              </label>
              <input
                type="number"
                min="7"
                value={config.log_retention_days ?? 30}
                onChange={(e) => updateField("log_retention_days", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Thanh hành động in-flow bên dưới — không dùng sticky bottom để tránh đè lên ô nhập liệu ở 200% font scale */}
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 sm:px-5 py-3.5 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3"
      >
        <AppButton
          variant="secondary"
          icon={RotateCcw}
          loading={resetting}
          disabled={saving}
          onClick={handleResetDefaults}
          className="text-xs sm:text-sm"
        >
          Khôi phục mặc định
        </AppButton>

        <AppButton
          variant="primary"
          icon={Save}
          loading={saving}
          disabled={resetting}
          loadingText="Đang lưu..."
          onClick={handleSave}
          className="flex-1 sm:flex-none px-6"
        >
          Lưu cấu hình
        </AppButton>
      </div>
    </div>
  );
}
