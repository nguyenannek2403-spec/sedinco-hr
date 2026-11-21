import React, { useState, useEffect, useMemo } from "react";
import {
  Copy,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  Save,
  QrCode
} from "lucide-react";
import { AppButton, AppModal, UserAvatar } from "./ui";
import { safePost, safePut, generateIdempotencyKey } from "../utils/api";
import { formatViCurrency } from "../utils/viNumberFormat";
import BankPickerDropdown, { BankBrandLogo } from "./BankPickerDropdown";
import { findBankByCodeOrBin } from "../utils/vietnamBanks";
import { toUpperUnaccentedName } from "../utils/vietqrParser";
import {
  generateVietQrDataUrl,
  buildVietQrQuickLinkUrl
} from "../utils/vietQrUtils";

/**
 * BankTransferModal V41
 * - Sinh mã VietQR chuyển lương (hỗ trợ cả STK số & Nickname chữ + số, encodeURIComponent an toàn)
 * - Hiển thị Logo thương hiệu ngân hàng thụ hưởng + [Copy STK], [Copy tiền], [Copy nội dung CK]
 * - Nếu nhân viên chưa cập nhật thẻ ngân hàng: hiển thị thông báo rõ ràng + form nhập nhanh cho Admin
 */
export default function BankTransferModal({
  open,
  onClose,
  item,
  month,
  year,
  canEditEmployeeBank = false,
  onBankSaved,
  onConfirmedPaid,
  showToast
}) {
  const [overrideBank, setOverrideBank] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Quick-add bank state when employee has no bank info (hoàn toàn độc lập với tên HR)
  const [quickBankCode, setQuickBankCode] = useState("");
  const [quickAcctNum, setQuickAcctNum] = useState("");
  const [quickAcctName, setQuickAcctName] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState("");

  const maNv = item?.ma_nv || item?.id_nhan_vien || "";
  const thang = Number(item?.thang || month || new Date().getMonth() + 1);
  const nam = Number(item?.nam || year || new Date().getFullYear());
  const netSalary = Math.max(0, Math.round(Number(item?.netSalary) || 0));

  useEffect(() => {
    if (!open || !item) return;
    setOverrideBank(null);
    setQuickBankCode("");
    setQuickAcctNum("");
    setQuickAcctName("");
    setQuickError("");
  }, [open, maNv]);

  const effectiveBank = useMemo(() => {
    if (overrideBank?.bank_account_number && overrideBank?.bank_code) {
      return overrideBank;
    }
    if (item?.bank_account_number && (item?.bank_code || item?.bank_name)) {
      return {
        bank_code: item.bank_code || "",
        bank_name: item.bank_name || "",
        bank_account_number: item.bank_account_number,
        bank_account_name: item.bank_account_name || ""
      };
    }
    return null;
  }, [overrideBank, item]);

  const resolvedBankMeta = useMemo(
    () =>
      effectiveBank
        ? findBankByCodeOrBin(effectiveBank.bank_code || effectiveBank.bank_name)
        : null,
    [effectiveBank]
  );

  const quickSelectedBank = useMemo(
    () => findBankByCodeOrBin(quickBankCode),
    [quickBankCode]
  );
  const cleanQuickAcct = String(quickAcctNum || "").replace(/\s+/g, "").trim();
  const cleanQuickName = toUpperUnaccentedName(quickAcctName);
  const isQuickFormComplete =
    Boolean(quickSelectedBank?.bin && quickSelectedBank?.shortName) &&
    cleanQuickAcct.length >= 3 &&
    cleanQuickAcct.length <= 35 &&
    /^[A-Za-z0-9._-]+$/.test(cleanQuickAcct) &&
    cleanQuickName.length >= 2;

  const isPaid =
    item?.employee_payment_status === "PAID" || item?.payment_status === "PAID";

  const transferNote = `SEDINCO LUONG T${thang} ${nam} ${maNv}`.trim();

  const vietQrQuickLink = useMemo(() => {
    if (!effectiveBank) return "";
    return buildVietQrQuickLinkUrl({
      bankCodeOrBin: effectiveBank.bank_code || effectiveBank.bank_name,
      accountNumber: effectiveBank.bank_account_number,
      accountName: effectiveBank.bank_account_name,
      amount: netSalary,
      description: transferNote
    });
  }, [effectiveBank, netSalary, transferNote]);

  useEffect(() => {
    let active = true;
    if (!open || !effectiveBank) {
      setQrDataUrl("");
      return () => {
        active = false;
      };
    }
    setQrLoading(true);
    generateVietQrDataUrl({
      bankCodeOrBin: effectiveBank.bank_code || effectiveBank.bank_name,
      accountNumber: effectiveBank.bank_account_number,
      amount: netSalary,
      description: transferNote
    })
      .then((url) => {
        if (active) setQrDataUrl(url || "");
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      })
      .finally(() => {
        if (active) setQrLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, effectiveBank, netSalary, transferNote]);

  const handleCopy = async (text, label) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text));
      } else {
        const ta = document.createElement("textarea");
        ta.value = String(text);
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast?.(`Đã sao chép ${label}!`, "success");
    } catch {
      showToast?.(`Không thể tự sao chép ${label}, vui lòng chọn để copy thủ công.`, "warning");
    }
  };

  const handleConfirmPaid = async () => {
    if (!maNv || confirming) return;
    setConfirming(true);
    try {
      const res = await safePost(
        "/payroll/employee-payment-status",
        {
          ma_nv: maNv,
          month: thang,
          year: nam,
          status: "PAID"
        },
        {
          idempotencyKey: generateIdempotencyKey(`emp_paid_${maNv}_${thang}_${nam}`)
        }
      );
      if (res?.success) {
        showToast?.(
          res.message || `Đã xác nhận chuyển khoản lương cho ${item?.ho_ten || maNv}!`,
          "success"
        );
        onConfirmedPaid?.(
          res.data || { ma_nv: maNv, month: thang, year: nam, employee_payment_status: "PAID" }
        );
        onClose();
      } else {
        showToast?.(res?.message || "Không thể xác nhận đã chuyển khoản.", "error");
      }
    } catch (err) {
      showToast?.(err?.message || "Lỗi kết nối máy chủ.", "error");
    } finally {
      setConfirming(false);
    }
  };

  const handleQuickSaveBank = async (e) => {
    e.preventDefault();
    setQuickError("");
    if (!isQuickFormComplete || quickSaving) return;

    setQuickSaving(true);
    try {
      const payload = {
        bank_code: quickSelectedBank.code,
        bank_name: quickSelectedBank.shortName,
        bank_account_number: cleanQuickAcct,
        bank_account_name: cleanQuickName
      };
      const res = await safePut(`/employees/${encodeURIComponent(maNv)}`, payload);
      if (res?.success) {
        setOverrideBank(payload);
        onBankSaved?.(maNv, payload);
        showToast?.(`Đã cập nhật thẻ ngân hàng cho ${item?.ho_ten || maNv}!`, "success");
      } else {
        setQuickError(res?.message || "Không thể cập nhật thông tin ngân hàng.");
      }
    } catch (err) {
      setQuickError(err?.message || "Lỗi kết nối máy chủ.");
    } finally {
      setQuickSaving(false);
    }
  };

  if (!open || !item) return null;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      disableClose={confirming || quickSaving}
      zIndexClass="z-[115]"
      maxWidthClass="sm:max-w-lg"
      icon={
        <UserAvatar
          name={item.ho_ten || maNv}
          avatarUrl={item.avatar_url}
          size="sm"
        />
      }
      title={`Chuyển khoản lương T${thang}/${nam}`}
      subtitle={`${item.ho_ten} • ${maNv}`}
      footer={
        <div className="flex items-center gap-2.5 w-full">
          <AppButton
            variant="secondary"
            disabled={confirming || quickSaving}
            onClick={onClose}
            className="flex-1"
          >
            Đóng
          </AppButton>
          {!isPaid ? (
            <AppButton
              variant="success"
              icon={CheckCircle2}
              loading={confirming}
              loadingText="Đang xác nhận..."
              disabled={quickSaving}
              data-testid="confirm-employee-paid-btn"
              onClick={handleConfirmPaid}
              className="flex-[1.6]"
            >
              ✓ Xác nhận đã chuyển khoản
            </AppButton>
          ) : (
            <div
              data-testid="employee-already-paid-badge"
              className="flex-[1.6] min-h-[44px] rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 px-3"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Đã chuyển khoản</span>
            </div>
          )}
        </div>
      }
    >
      <div
        data-testid="bank-transfer-modal-body"
        className="p-4 sm:p-5 space-y-4 text-slate-800 dark:text-slate-100"
      >
        {isPaid && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              Kỳ lương T{thang}/{nam} của nhân viên này đã được xác nhận chuyển khoản
              {item.employee_paid_at_vn ? ` lúc ${item.employee_paid_at_vn}` : ""}.
            </span>
          </div>
        )}

        {/* Khung số tiền thực nhận */}
        <div className="rounded-2xl bg-[#F4F6FA] dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 p-3.5 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-300">
              Số tiền thực nhận (Net)
            </div>
            <div
              data-testid="transfer-net-amount"
              className="text-xl font-black font-mono text-[#E11D48] dark:text-rose-300 mt-0.5"
            >
              {formatViCurrency(netSalary)}
            </div>
          </div>
          <button
            type="button"
            data-testid="copy-bank-amount-btn"
            onClick={() => handleCopy(String(netSalary), "số tiền lương")}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-[#0051CA] text-xs font-bold text-[#111C2D] dark:text-slate-100 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy tiền</span>
          </button>
        </div>

        {effectiveBank ? (
          <div className="space-y-3.5">
            {/* Mã VietQR offline-ready hỗ trợ STK số & Nickname chữ + số */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 p-4 flex flex-col items-center text-center space-y-2.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0051CA] dark:text-blue-300">
                <QrCode className="w-4 h-4" />
                <span>Mã VietQR chuyển khoản nhanh NAPAS 24/7</span>
              </div>

              {qrLoading ? (
                <div className="w-52 h-52 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs text-slate-500 dark:text-slate-300">
                  Đang tạo mã VietQR...
                </div>
              ) : qrDataUrl ? (
                <div className="p-2.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <img
                    src={qrDataUrl}
                    alt={`VietQR chuyển lương ${maNv}`}
                    data-testid="vietqr-image"
                    data-quicklink={vietQrQuickLink}
                    className="w-48 h-48 object-contain"
                  />
                </div>
              ) : (
                <div className="w-full p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                  Không tạo được QR cho mã ngân hàng "{effectiveBank.bank_code}". Vui lòng chuyển theo thông tin STK/Nickname bên dưới.
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Quét bằng ứng dụng Ngân hàng / ZaloPay / MoMo để điền sẵn STK/Nickname, số tiền &amp; nội dung
              </p>
            </div>

            {/* Chi tiết tài khoản thụ hưởng + nút copy nhanh */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 divide-y divide-slate-100 dark:divide-slate-700/80 text-xs sm:text-sm">
              <div className="p-3 flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Ngân hàng</span>
                <div className="flex items-center gap-2 min-w-0">
                  {resolvedBankMeta && <BankBrandLogo bank={resolvedBankMeta} sizeClass="w-7 h-7" />}
                  <span className="font-extrabold text-[#111C2D] dark:text-white text-right truncate">
                    {effectiveBank.bank_name || resolvedBankMeta?.shortName || effectiveBank.bank_code}
                  </span>
                </div>
              </div>

              <div className="p-3 flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Chủ tài khoản</span>
                <span
                  data-testid="transfer-bank-holder"
                  className="font-extrabold uppercase text-[#111C2D] dark:text-white text-right"
                >
                  {effectiveBank.bank_account_name || "Chưa cập nhật"}
                </span>
              </div>

              <div className="p-3 flex items-center justify-between gap-2">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium block">
                    Số tài khoản / Nickname
                  </span>
                  <span
                    data-testid="transfer-bank-acct"
                    className="text-base font-mono font-black text-[#0051CA] dark:text-blue-300 break-all"
                  >
                    {effectiveBank.bank_account_number}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="copy-bank-acct-btn"
                  onClick={() => handleCopy(effectiveBank.bank_account_number, "số tài khoản")}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#F4F6FA] dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-[#111C2D] dark:text-slate-100 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy STK</span>
                </button>
              </div>

              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-slate-500 dark:text-slate-400 font-medium block">Nội dung CK</span>
                  <span
                    data-testid="transfer-description-text"
                    className="font-mono font-bold text-[#111C2D] dark:text-slate-100 break-all"
                  >
                    {transferNote}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(transferNote, "nội dung chuyển khoản")}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#F4F6FA] dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-[#111C2D] dark:text-slate-100 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div
              data-testid="missing-bank-card-notice"
              className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/45 border border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200 space-y-1.5"
            >
              <div className="flex items-center gap-2 font-extrabold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Nhân viên chưa cập nhật thẻ ngân hàng</span>
              </div>
              <p className="text-xs leading-relaxed">
                Nhân viên có thể tự thêm thẻ hoặc quét QR trong mục Tài khoản cá nhân
                {canEditEmployeeBank
                  ? ", hoặc Quản trị viên có thể nhập nhanh thông tin ngân hàng ngay bên dưới."
                  : "."}
              </p>
            </div>

            {canEditEmployeeBank && (
              <form
                data-testid="admin-quick-bank-form"
                onSubmit={handleQuickSaveBank}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white">
                  <Landmark className="w-4 h-4 text-[#0051CA] dark:text-blue-400" />
                  <span>Nhập nhanh thông tin ngân hàng cho {maNv}</span>
                </div>

                {quickError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                    {quickError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Ngân hàng <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <BankPickerDropdown
                    value={quickBankCode}
                    disabled={quickSaving}
                    testId="quick-bank-picker-dropdown"
                    onChange={(bank) => setQuickBankCode(bank?.code || "")}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Số tài khoản / Nickname <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid="quick-bank-acct-input"
                    value={quickAcctNum}
                    onChange={(e) =>
                      setQuickAcctNum(
                        e.target.value.replace(/\s+/g, "").replace(/[^A-Za-z0-9._-]/g, "")
                      )
                    }
                    placeholder="VD: 3141000998877 hoặc ANNGUYEN88"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-sm font-mono font-bold text-[#111C2D] dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Chủ tài khoản (IN HOA KHÔNG DẤU){" "}
                    <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid="quick-bank-name-input"
                    value={quickAcctName}
                    onChange={(e) => setQuickAcctName(e.target.value.toUpperCase())}
                    onBlur={() => setQuickAcctName((prev) => toUpperUnaccentedName(prev))}
                    placeholder="VD: NGUYEN VAN A"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-sm font-bold uppercase text-[#111C2D] dark:text-slate-100"
                  />
                </div>

                <AppButton
                  type="submit"
                  variant={isQuickFormComplete ? "zalo" : "ghost"}
                  fullWidth
                  icon={Save}
                  loading={quickSaving}
                  loadingText="Đang lưu..."
                  disabled={!isQuickFormComplete || quickSaving}
                  data-testid="quick-save-bank-btn"
                  className={
                    !isQuickFormComplete
                      ? "opacity-50 cursor-not-allowed bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 shadow-none"
                      : ""
                  }
                >
                  Lưu thẻ &amp; Tạo mã VietQR
                </AppButton>
              </form>
            )}
          </div>
        )}
      </div>
    </AppModal>
  );
}
