import React from "react";
import { ArrowLeft } from "lucide-react";
import { UserAvatar } from "../ui";

const BOTTOM_GRID_COLS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5"
};

export function UnifiedAppHeader({
  title,
  subtitle = "",
  avatarUser = null,
  onAvatarClick = null,
  onBack = null,
  leftAddon = null,
  centerContent = null,
  actions = null,
  reserveCapsuleOnDesktop = false,
  className = ""
}) {
  return (
    <header
      data-unified-header="true"
      className={`row-start-1 w-full min-w-0 max-w-full overflow-hidden shrink-0 sedinco-glass-header border-b border-slate-200/80 dark:border-slate-800 pl-3 sm:pl-5 pr-2 sm:pr-4 u-header-safe flex items-center justify-between gap-2 select-none transition-colors duration-200 ${className}`}
      style={{ zIndex: "var(--z-header, 40)" }}
    >
      {/* Khu vực trái: Back (nếu có) + Addon + Avatar + Title/Role (truncate an toàn mọi chiều rộng) */}
      <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-2.5">
        {typeof onBack === "function" && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Quay lại"
            className="min-w-[44px] min-h-[44px] px-2 rounded-xl bg-rose-50/90 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#B80035] dark:text-rose-300 border border-rose-200/80 dark:border-slate-700 inline-flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
          </button>
        )}

        {leftAddon}

        {avatarUser && (
          onAvatarClick ? (
            <button
              type="button"
              onClick={onAvatarClick}
              aria-label="Hồ sơ tài khoản"
              title={avatarUser.ho_ten || avatarUser.ma_nv || "Tài khoản"}
              className="min-w-[40px] min-h-[40px] p-1 rounded-full border border-slate-200/80 dark:border-slate-700 bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <UserAvatar
                name={avatarUser.ho_ten || avatarUser.username || avatarUser.ma_nv || "NV"}
                avatarUrl={avatarUser.avatar_url}
                size="xs"
              />
            </button>
          ) : (
            <div className="shrink-0">
              <UserAvatar
                name={avatarUser.ho_ten || avatarUser.username || avatarUser.ma_nv || "NV"}
                avatarUrl={avatarUser.avatar_url}
                size="xs"
              />
            </div>
          )
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-xs sm:text-sm md:text-base font-extrabold tracking-tight text-[#111C2D] dark:text-white truncate leading-tight">
            {title}
          </h2>
          {subtitle && (
            <div className="text-[11px] font-bold text-[#B80035] dark:text-rose-300 truncate leading-tight">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Khu vực giữa (tùy chọn) */}
      {centerContent && (
        <div className="shrink-0 flex items-center justify-center min-w-0">
          {centerContent}
        </div>
      )}

      {/* Khu vực tiện ích nằm hoàn toàn bên trái vùng an toàn Zalo Capsule */}
      {actions && (
        <div className="shrink-0 flex items-center justify-end gap-1 sm:gap-1.5">
          {actions}
        </div>
      )}

      {/* Khu vực phải bất khả xâm phạm dành riêng cho cụm nút (••• | ✕) của Zalo Mini App */}
      <div
        data-zalo-capsule-guard="true"
        aria-hidden="true"
        className={`${reserveCapsuleOnDesktop ? "" : "lg:hidden"} shrink-0 pointer-events-none`}
        style={{ width: "var(--zalo-capsule-w)" }}
      />
    </header>
  );
}

export function UnifiedMainViewport({
  dataScrollContainer = "main",
  className = "",
  children
}) {
  return (
    <main
      data-scroll-container={dataScrollContainer}
      className={`row-start-2 w-full min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y pb-6 ${className}`}
      style={{ zIndex: "var(--z-content, 1)" }}
    >
      {children}
    </main>
  );
}

export function UnifiedBottomNav({
  items = [],
  activeTab,
  onSelectTab,
  badgeMap = {},
  hideOnDesktop = false,
  ariaLabel = "Điều hướng chính"
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const colsClass = BOTTOM_GRID_COLS[Math.min(5, Math.max(2, items.length))] || "grid-cols-4";

  return (
    <nav
      data-unified-bottom-nav="true"
      aria-label={ariaLabel}
      className={`row-start-3 shrink-0 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800 px-1.5 pt-1.5 u-bottom-nav-safe shadow-[0_-4px_20px_rgba(17,28,45,0.06)] transition-colors duration-200 ${
        hideOnDesktop ? "lg:hidden" : ""
      }`}
      style={{ zIndex: "var(--z-bottom-nav, 45)" }}
    >
      <div className={`max-w-lg mx-auto grid ${colsClass} gap-1`}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const badgeCount = Number(badgeMap[item.id] || 0);
          return (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              data-active={isActive ? "true" : "false"}
              onClick={() => typeof onSelectTab === "function" && onSelectTab(item.id)}
              className={`relative min-h-[48px] flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl border transition-all cursor-pointer min-w-0 ${
                isActive
                  ? "text-[#B80035] dark:text-rose-300 bg-[#FFE4E6] dark:bg-rose-950/80 border-[#E11D48]/50 dark:border-rose-500/60 font-extrabold"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#111C2D] dark:hover:text-slate-200 border-transparent font-semibold"
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? "stroke-[2.5]" : "stroke-[2]"}`} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-[#E11D48] text-white text-[10px] font-extrabold flex items-center justify-center">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] sm:text-xs mt-0.5 leading-tight max-w-full truncate">
                {item.shortLabel || item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function UniversalAppShell({
  role = "worker",
  header = null,
  bottomNav = null,
  sidebar = null,
  dataScrollContainer = "main",
  containerClassName = "",
  mainClassName = "",
  children
}) {
  if (sidebar) {
    return (
      <div
        data-app-shell="universal"
        data-role={role}
        className={`flex w-full overflow-hidden bg-[#F1F5F9] dark:bg-[#0B1120] text-[#111C2D] dark:text-slate-100 font-sans relative transition-colors duration-200 ${containerClassName}`}
        style={{ height: "var(--visual-vh)", maxHeight: "var(--visual-vh)" }}
      >
        {sidebar}
        <div
          className="flex-1 min-w-0 min-h-0 grid overflow-hidden"
          style={{
            height: "var(--visual-vh)",
            gridTemplateColumns: "minmax(0, 1fr)",
            gridTemplateRows: "auto minmax(0, 1fr) auto"
          }}
        >
          {header}
          <UnifiedMainViewport dataScrollContainer={dataScrollContainer} className={mainClassName}>
            {children}
          </UnifiedMainViewport>
          {bottomNav}
        </div>
      </div>
    );
  }

  return (
    <div
      data-app-shell="universal"
      data-role={role}
      className={`w-full overflow-hidden bg-[#F1F5F9] dark:bg-[#0B1120] text-[#111C2D] dark:text-slate-100 font-sans grid relative transition-colors duration-200 ${containerClassName}`}
      style={{
        height: "var(--visual-vh)",
        maxHeight: "var(--visual-vh)",
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr) auto"
      }}
    >
      {header}
      <UnifiedMainViewport dataScrollContainer={dataScrollContainer} className={mainClassName}>
        {children}
      </UnifiedMainViewport>
      {bottomNav}
    </div>
  );
}

export default UniversalAppShell;
