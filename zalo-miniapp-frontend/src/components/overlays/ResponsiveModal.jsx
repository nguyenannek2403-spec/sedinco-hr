import React from "react";
import AppModal from "../ui/AppModal";

/**
 * ResponsiveModal — Tự động điều chỉnh giữa Dialog / BottomSheet / FullScreenSheet theo độ phức tạp
 */
export default function ResponsiveModal({
  mode = "sheet", // "dialog" | "sheet" | "fullscreen" | "drawer"
  ...props
}) {
  return <AppModal variant={mode} fullScreenSheet={mode === "fullscreen"} {...props} />;
}
