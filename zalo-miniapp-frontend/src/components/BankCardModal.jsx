import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  CreditCard,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Loader2,
  Info
} from "lucide-react";
import { AppButton, AppModal } from "./ui";
import { safePut } from "../utils/api";
import BankPickerDropdown from "./BankPickerDropdown";
import { findBankByCodeOrBin } from "../utils/vietnamBanks";
import {
  toUpperUnaccentedName,
  decodeBankQrFromImageFile
} from "../utils/vietqrParser";

/**
 * BankCardModal V41
 * - Quét QR chuẩn EMVCo/VietQR hoàn toàn trên browser (2 lượt: trực tiếp + tăng tương phản),
 *   hỗ trợ cả Số tài khoản lẫn Nickname chữ + số, đọc Tag 59 độc lập với tên nhân viên & XÓA SẠCH ảnh ngay lập tức
 * - Bộ chọn Ngân hàng kèm logo thương hiệu (BankPickerDropdown)
 * - Khóa nút "Lưu thẻ ngân hàng" cho tới khi cả 3 trường (Ngân hàng, STK/Nickname, Chủ thẻ) đều đầy đủ & hợp lệ
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
  const [qrStatus, setQrStatus] = useState(null); // { type: 'success'|'hint'|'error', message: string }
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBankCode(currentUser?.bank_code || "");
    setBankAccountNumber(currentUser?.bank_account_number || "");
    // Tuyệt đối KHÔNG tự lấy tên nhân viên (currentUser.ho_ten) đè vào tên chủ thẻ
    setBankAccountName(currentUser?.bank_account_name || "");
    setQrStatus(null);
    setFormError("");
  }, [
    open,
    currentUser?.bank_code,
    currentUser?.bank_account_number,
    currentUser?.bank_account_name
  ]);

  const selectedBank = useMemo(() => findBankByCodeOrBin(bankCode), [bankCode]);

  const cleanAccountNum = useMemo(
    () => String(bankAccountNumber || "").replace(/\s+/g, "").trim(),
    [bankAccountNumber]
  );

  const normalizedHolderName = useMemo(
    () => toUpperUnaccentedName(bankAccountName),
    [bankAccountName]
  );

  const isBankValid = Boolean(selectedBank?.bin && selectedBank?.shortName);
  const isAccountValid =
    cleanAccountNum.length >= 3 &&
    cleanAccountNum.length <= 35 &&
    /^[A-Za-z0-9._-]+$/.test(cleanAccountNum);
  const isHolderValid = normalizedHolderName.length >= 2;
  const isFormComplete = isBankValid && isAccountValid && isHolderValid;

  const handleSelectQrImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecodingQr(true);
    setQrStatus(null);
    setFormError("");
    try {
      const parsed = await decodeBankQrFromImageFile(file);
      if (parsed && parsed.recognized) {
        const matchedBank = findBankByCodeOrBin(parsed.bank_bin || parsed.bank_code);
        if (matchedBank) {
          setBankCode(matchedBank.code);
        }
        if (parsed.bank_account_number) {
          // Giữ nguyên cả chữ cái lẫn chữ số (hỗ trợ Nickname ngân hàng)
          setBankAccountNumber(String(parsed.bank_account_number).replace(/\s+/g, "").trim());
        }
        if (parsed.has_holder_name && parsed.bank_account_name) {
          setBankAccountName(toUpperUnaccentedName(parsed.bank_account_name));
          setQrStatus({
            type: "success",
            message:
              "Đã nhận diện xong Ngân hàng, Số TK và Tên chủ thẻ — đã tự động xóa ảnh QR để bảo mật."
          });
        } else {
          // Không có Tag 59 hoặc chỉ là NA/VIETQR -> KHÔNG lấy tên nhân viên đè vào, giữ nguyên/trống
          setQrStatus({
            type: "hint",
            message:
              "Đã nhận diện Ngân hàng & Số tài khoản — vui lòng nhập đúng tên chủ thẻ ngân hàng (đã tự động xóa ảnh QR để bảo mật)."
          });
        }
      } else {
        setQrStatus({
          type: "error",
          message:
            parsed?.reason ||
            "Không nhận diện được mã QR ngân hàng. Vui lòng thử ảnh rõ hơn hoặc nhập thủ công bên dưới."
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
      try {
        e.target.value = "";
      } catch {}
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!isFormComplete || saving || decodingQr) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        bank_code: selectedBank.code,
        bank_name: selectedBank.shortName,
        bank_account_number: cleanAccountNum,
        bank_account_name: normalizedHolderName
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
            variant={isFormComplete ? "zalo" : "ghost"}
            icon={CheckCircle2}
            loading={saving}
            loadingText="Đang lưu..."
            disabled={!isFormComplete || saving || decodingQr}
            data-testid="save-bank-card-btn"
            className={`flex-[1.5] ${
              !isFormComplete
                ? "opacity-50 cursor-not-allowed bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 shadow-none"
                : ""
            }`}
          >
            Lưu thẻ ngân hàng
          </AppButton>
        </div>
      }
    >
      <form id="bank-card-modal-form" onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        {/* CÁCH 1: ĐỌC ẢNH QR TẠI TRÌNH DUYỆT & TỰ ĐỘNG XÓA */}
        <div className="rounded-2xl border border-blue-200/80 dark:border-blue-800/70 bg-blue-50/70 dark:bg-blue-950/35 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-[#0051CA] dark:text-blue-300 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-slate-100">
                Cách 1: Chọn ảnh QR ngân hàng để điền nhanh
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Hỗ trợ cả STK &amp; Nickname chữ cái. Hệ thống <strong>không lưu ảnh QR</strong>.
              </p>
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

          {qrStatus?.type === "hint" && (
            <div
              data-testid="bank-qr-holder-hint"
              className="p-2.5 rounded-xl bg-blue-100/80 dark:bg-blue-950/70 border border-blue-300 dark:border-blue-700 text-[#0051CA] dark:text-blue-200 text-xs font-semibold flex items-start gap-2"
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
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
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Ngân hàng <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <BankPickerDropdown
              value={bankCode}
              disabled={saving || decodingQr}
              testId="bank-picker-dropdown"
              onChange={(bank) => setBankCode(bank?.code || "")}
            />
          </div>

          <div>
            <label
              htmlFor="bank-account-number-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
            >
              Số tài khoản hoặc Nickname <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="bank-account-number-input"
              data-testid="bank-account-number-input"
              type="text"
              autoComplete="off"
              value={bankAccountNumber}
              onChange={(e) =>
                setBankAccountNumber(
                  e.target.value.replace(/\s+/g, "").replace(/[^A-Za-z0-9._-]/g, "")
                )
              }
              placeholder="VD: 1012345678 hoặc ANNGUYEN88"
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-sm font-mono font-bold text-[#111C2D] dark:text-slate-100 focus:outline-none focus:border-[#0051CA]"
            />
            {bankAccountNumber && !isAccountValid && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                Nhập tối thiểu 3 ký tự chữ cái hoặc chữ số (không chứa khoảng trắng).
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="bank-account-name-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
            >
              Họ và tên chủ tài khoản (IN HOA KHÔNG DẤU){" "}
              <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="bank-account-name-input"
              data-testid="bank-account-name-input"
              type="text"
              autoComplete="off"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
              onBlur={() => setBankAccountName((prev) => toUpperUnaccentedName(prev))}
              placeholder="VD: NGUYEN VAN AN"
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-sm font-bold uppercase text-[#111C2D] dark:text-slate-100 focus:outline-none focus:border-[#0051CA]"
            />
            {!isFormComplete && (
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Vui lòng chọn Ngân hàng, nhập STK/Nickname và đúng Tên chủ tài khoản để mở khóa nút Lưu.
              </p>
            )}
          </div>
        </div>
      </form>
    </AppModal>
  );
}
