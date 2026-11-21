import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, Search, Check, Landmark } from "lucide-react";
import { VIETNAM_BANKS, findBankByCodeOrBin, getBankLogoUrl } from "../utils/vietnamBanks";
import { toUpperUnaccentedName } from "../utils/vietqrParser";

/**
 * Hiển thị logo ngân hàng chính thức VietQR kèm fallback badge chữ viết tắt theo brandColor (không bao giờ ảnh vỡ).
 */
export function BankBrandLogo({ bank, sizeClass = "w-9 h-9" }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = getBankLogoUrl(bank);

  useEffect(() => {
    setImgFailed(false);
  }, [bank?.code, logoUrl]);

  if (!bank) {
    return (
      <div
        className={`${sizeClass} rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-400`}
      >
        <Landmark className="w-4 h-4" />
      </div>
    );
  }

  if (!logoUrl || imgFailed) {
    return (
      <div
        data-testid={`bank-logo-fallback-${bank.code}`}
        style={{ backgroundColor: bank.brandColor || "#0051CA" }}
        className={`${sizeClass} rounded-lg border border-black/10 flex items-center justify-center shrink-0 text-white font-black text-[10px] tracking-tighter select-none`}
      >
        {String(bank.code || bank.shortName || "BK").slice(0, 4).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden`}
    >
      <img
        src={logoUrl}
        alt={bank.shortName}
        loading="lazy"
        onError={() => setImgFailed(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

/**
 * Bộ chọn Ngân hàng trực quan có Logo thương hiệu & thanh tìm kiếm nhanh (VCB, MB, Techcombank...).
 */
export default function BankPickerDropdown({
  value = "",
  onChange,
  disabled = false,
  testId = "bank-picker-dropdown",
  placeholder = "-- Chọn ngân hàng nhận lương --"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedBank = useMemo(() => findBankByCodeOrBin(value), [value]);

  const filteredBanks = useMemo(() => {
    const q = toUpperUnaccentedName(query);
    if (!q) return VIETNAM_BANKS;
    return VIETNAM_BANKS.filter((bank) => {
      const hay = toUpperUnaccentedName(
        `${bank.code} ${bank.bin} ${bank.shortName} ${bank.fullName} ${(bank.aliases || []).join(" ")}`
      );
      return hay.includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const handleSelectBank = (bank) => {
    onChange?.(bank);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="space-y-1.5">
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className="w-full min-h-[52px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-[#0051CA] dark:hover:border-blue-400 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer disabled:opacity-60"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <BankBrandLogo bank={selectedBank} />
          {selectedBank ? (
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                {selectedBank.shortName}{" "}
                <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  ({selectedBank.code})
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {selectedBank.fullName}
              </div>
            </div>
          ) : (
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold truncate">
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          data-testid={`${testId}-menu`}
          className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-[#F4F6F9] dark:bg-slate-800/80">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                data-testid={`${testId}-search`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm nhanh: VCB, MB, Techcombank, BIDV..."
                className="w-full min-h-[44px] pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#111C2D] dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#0051CA]"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800">
            {filteredBanks.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                Không tìm thấy ngân hàng khớp từ khóa "{query}".
              </div>
            ) : (
              filteredBanks.map((bank) => {
                const isSelected = selectedBank?.bin === bank.bin;
                return (
                  <button
                    key={bank.bin}
                    type="button"
                    data-testid={`bank-option-${bank.code}`}
                    onClick={() => handleSelectBank(bank)}
                    className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/80 dark:bg-blue-950/50"
                        : "hover:bg-[#F4F6F9] dark:hover:bg-slate-800/80"
                    }`}
                  >
                    <BankBrandLogo bank={bank} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                          {bank.shortName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px] font-bold">
                          {bank.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {bank.fullName}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[#0051CA] dark:text-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
