import React, { useState, useEffect, useRef } from "react";
import {
  CreditCard,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Loader2
} from "lucide-react";
import { AppButton, AppModal } from "./ui";
import { safePut } from "../utils/api";
import {
  VIETNAM_BANKS,
  findBankByCodeOrBin,
  toUpperUnaccentedName,
  decodeBankQrFromImageFile
} from "../utils/vietQrUtils";

/**
 * BankCardModal V40
 * - Cách 1: Chọn ảnh QR ngân hàng -> đọc hoàn toàn trên Browser bằng jsQR + Canvas, điền tự động & XÓA SẠCH ảnh ngay lập tức
 * - Cách 2: Chọn ngân hàng từ danh sách chuẩn NAPAS + nhập Số tài khoản (chỉ số) + Tên chủ TK IN HOA KHÔNG DẤU
 */
export default function BankCardModal({
  open,
  onClose,
  currentUser,
  onSaved,
  showToast
}) {
  const fileInputRef = useRef(null);
  const [bankCode, setBankCode] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [decodingQr, setDecodingQr] = useState(false);
  const [qrStatus, setQrStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBankCode(currentUser?.bank_code || "");
    setBankAccountNumber(currentUser?.bank_account_number || "");
    setBankAccountName(
      currentUser?.bank_account_name || toUpperUnaccentedName(currentUser?.ho_ten || "")
    );
    setQrStatus(null);
    setFormError("");
  }, [
    open,
    currentUser?.bank_code,
    currentUser?.bank_account_number,
    currentUser?.bank_account_name,
    currentUser?.ho_ten
  ]);

  const handleSelectQrImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecodingQr(true);
    setQrStatus(null);
    setFormError("");
    try {
      const parsed = await decodeBankQrFromImageFile(file);
      if (parsed && parsed.recognized) {
        const matchedBank = findBankByCodeOrBin(parsed.bank_code || parsed.bank_bin);
        if (matchedBank) {
          setBankCode(matchedBank.code);
        }
        if (parsed.bank_account_number) {
          setBankAccountNumber(String(parsed.bank_account_number).replace(/\D/g, ""));
        }
        if (parsed.bank_account_name) {
          setBankAccountName(toUpperUnaccentedName(parsed.bank_account_name));
        }
        setQrStatus({
          type: "success",
          message: "Đã nhận diện xong và tự động xóa ảnh QR để bảo mật."
        });
      } else {
        setQrStatus({
          type: "error",
          message:
            parsed?.reason ||
            "Không nhận diện được mã QR ngân hàng. Vui lòng thử ảnh khác hoặc nhập thủ công bên dưới."
        });
      }
    } catch (err) {
      setQrStatus({
        type: "error",
        message:
          err?.message ||
          "Không thể đọc ảnh đã chọn. Vui lòng thử ảnh QR rõ nét hơn hoặc nhập thủ công."
      });
    } finally {
      setDecodingQr(false);
      // Luôn reset input file để tránh giữ reference tệp trong DOM
      try {
        e.target.value = "";
      } catch {}
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const selectedBank = findBankByCodeOrBin(bankCode);
    if (!selectedBank) {
      setFormError("Vui lòng chọn Ngân hàng nhận lương.");
      return;
    }
    const cleanAcct = String(bankAccountNumber || "").replace(/\D/g, "");
    if (cleanAcct.length < 5 || cleanAcct.length > 25) {
      setFormError("Số tài khoản chỉ gồm chữ số (từ 5 đến 25 chữ số).");
      return;
    }
    const cleanName = toUpperUnaccentedName(bankAccountName);
    if (!cleanName || cleanName.length < 2) {
      setFormError("Vui lòng nhập Tên chủ tài khoản (chữ IN HOA không dấu).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        bank_code: selectedBank.code,
        bank_name: selectedBank.shortName,
        bank_account_number: cleanAcct,
        bank_account_name: cleanName
      };
      const res = await safePut("/account/bank-card", payload);
      if (res?.success) {
        const savedBank = res.data || payload;
        if (typeof onSaved === "function") onSaved(savedBank);
        if (typeof showToast === "function") {
          showToast(res.message || "Đã lưu thông tin thẻ ngân hàng nhận lương!", "success");
        }
        onClose();
      } else {
        setFormError(res?.message || "Không thể lưu thẻ ngân hàng. Vui lòng thử lại.");
      }
    } catch (err) {
      setFormError(err?.message || "Lỗi kết nối máy chủ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      disableClose={saving || decodingQr}
      title="Thẻ ngân hàng nhận lương"
      subtitle={currentUser?.ho_ten ? `${currentUser.ho_ten} • ${currentUser.ma_nv}` : "Tài khoản cá nhân"}
      maxWidthClass="sm:max-w-lg"
      footer={
        <div className="flex items-center gap-2.5">
          <AppButton
            variant="secondary"
            disabled={saving || decodingQr}
            onClick={onClose}
            className="flex-1"
          >
            Đóng
          </AppButton>
          <AppButton
            type="submit"
            form="bank-card-modal-form"
            variant="primary"
            icon={CheckCircle2}
            loading={saving}
            loadingText="Đang lưu..."
            disabled={decodingQr}
            data-testid="save-bank-card-btn"
            className="flex-[1.5]"
          >
            Lưu thẻ ngân hàng
          </AppButton>
        </div>
      }
    >
      <form id="bank-card-modal-form" onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        {/* CÁCH 1: ĐỌC ẢNH QR TẠI TRÌNH DUYỆT & TỰ ĐỘNG XÓA */}
        <div className="rounded-2xl border border-blue-200/80 dark:border-blue-800/70 bg-blue-50/70 dark:bg-blue-950/35 p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-[#0051CA] dark:text-blue-300 flex items-center justify-center shrink-0">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-slate-100">
                  Cách 1: Chọn ảnh QR ngân hàng để điền nhanh
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Hệ thống chỉ trích xuất chữ, <strong>không lưu ảnh QR</strong> lên máy chủ.
                </p>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            data-testid="bank-qr-file-input"
            onChange={handleSelectQrImage}
            className="hidden"
          />

          <button
            type="button"
            data-testid="bank-qr-upload-btn"
            disabled={decodingQr || saving}
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-[#0051CA] dark:hover:border-blue-400 text-[#0051CA] dark:text-blue-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            {decodingQr ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang nhận diện mã QR...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Chọn ảnh QR ngân hàng (VietQR)</span>
              </>
            )}
          </button>

          {qrStatus?.type === "success" && (
            <div
              data-testid="bank-qr-success-notice"
              className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-start gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{qrStatus.message}</span>
            </div>
          )}

          {qrStatus?.type === "error" && (
            <div
              data-testid="bank-qr-error-notice"
              className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>{qrStatus.message}</span>
            </div>
          )}
        </div>

        {/* CÁCH 2: NHẬP HOẶC KIỂM TRA THÔNG TIN */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
            <h4 className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-slate-100">
              Cách 2: Thông tin tài khoản nhận lương
            </h4>
          </div>

          {formError && (
            <div
              data-testid="bank-form-error"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold"
            >
              {formError}
            </div>
          )}

          <div>
            <label
              htmlFor="bank-code-select"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
            >
              Ngân hàng <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <select
              id="bank-code-select"
              data-testid="bank-code-select"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-sm font-semibold text-[#111C2D] dark:text-slate-100 focus:outline-none focus:border-[#E11D48]"
            >
              <option value="">-- Chọn ngân hàng --</option>
              {VIETNAM_BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.shortName} — {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="bank-account-number-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
            >
              Số tài khoản <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="bank-account-number-input"
              data-testid="bank-account-number-input"
              type="text"
              inputMode="numeric"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ""))}
              placeholder="Ví dụ: 1029384756"
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-sm font-mono font-bold text-[#111C2D] dark:text-slate-100 focus:outline-none focus:border-[#E11D48]"
            />
          </div>

          <div>
            <label
              htmlFor="bank-account-name-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
            >
              Tên chủ tài khoản (IN HOA KHÔNG DẤU) <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="bank-account-name-input"
              data-testid="bank-account-name-input"
              type="text"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
              onBlur={() => setBankAccountName((prev) => toUpperUnaccentedName(prev))}
              placeholder="Ví dụ: NGUYEN VAN AN"
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-sm font-bold uppercase text-[#111C2D] dark:text-slate-100 focus:outline-none focus:border-[#E11D48]"
            />
          </div>
        </div>
      </form>
    </AppModal>
  );
}
