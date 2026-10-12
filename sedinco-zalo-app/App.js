import axios from "axios";
import { registerRootComponent } from "expo";
import * as ImagePicker from "expo-image-picker";
import {
    AlertTriangle,
    Briefcase,
    Building,
    Calculator,
    Calendar,
    ChevronDown,
    Clock,
    Gift,
    Home,
    Key,
    Lock,
    LogIn,
    LogOut,
    Mail,
    Phone,
    Send,
    ShieldCheck,
    Upload,
    User,
    X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    Image,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const API_BASE = (Platform.OS === "web" && typeof window !== "undefined")
  ? `http://${window.location.hostname}:5001/api`
  : "http://192.168.1.15:5001/api";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginMaNv, setLoginMaNv] = useState("NV001");
  const [loginPass, setLoginPass] = useState("123456");

  const [currentTab, setCurrentTab] = useState("dashboard");
  const [employeeId, setEmployeeId] = useState("NV001");
  const [employeeInfo, setEmployeeInfo] = useState(null);

  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [checkInStatus, setCheckInStatus] = useState("not_checked_in");
  const [lateNotice, setLateNotice] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [myAttendanceDays, setMyAttendanceDays] = useState([]);

  const [requestModal, setRequestModal] = useState({
    isOpen: false,
    day: null,
  });
  const [requestType, setRequestType] = useState("Làm thêm (OT)");
  const [selectedDayInModal, setSelectedDayInModal] = useState(
    new Date().getDate(),
  );
  const [fromTime, setFromTime] = useState("08:00");
  const [toTime, setToTime] = useState("17:00");
  const [requestReason, setRequestReason] = useState("");

  const [myRequests, setMyRequests] = useState([]);
  const [payrollHistory, setPayrollHistory] = useState([]);
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState(
    new Date().getMonth() + 1,
  );
  const [isMonthPickerModal, setIsMonthPickerModal] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [companyInfo, setCompanyInfo] = useState({
    company_name: "Sedinco HR",
  });

  useEffect(() => {
    if (isLoggedIn) {
      fetchCompanyInfo();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchEmployeeData();
    }
  }, [isLoggedIn, employeeId, companyInfo]);

  useEffect(() => {
    if (isLoggedIn && currentTab === "attendance") {
      fetchMyAttendance();
      fetchMyRequests();
    } else if (isLoggedIn && currentTab === "payroll") {
      fetchPayrollHistory();
    }
  }, [
    currentTab,
    selectedMonth,
    selectedYear,
    selectedPayrollMonth,
    isLoggedIn,
  ]);

  const handleLogin = () => {
    axios
      .post(`${API_BASE}/login`, { ma_nv: loginMaNv, password: loginPass })
      .then((res) => {
        if (res.data && res.data.success) {
          setEmployeeId(loginMaNv);
          setIsLoggedIn(true);
        } else {
          alert(res.data?.message || "Đăng nhập thất bại!");
        }
      })
      .catch((err) => alert("Không kết nối được server: " + err.message));
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCheckInStatus("not_checked_in");
    setCheckInTime(null);
    setCheckOutTime(null);
  };

  const fetchCompanyInfo = () => {
    axios
      .get(`${API_BASE}/company`)
      .then((res) => {
        if (res.data?.data) setCompanyInfo(res.data.data);
      })
      .catch(() => {});
  };

  const fetchEmployeeData = () => {
    axios
      .get(`${API_BASE}/employees`)
      .then((res) => {
        const emps = res.data?.data || [];
        const me = emps.find((e) => e.ma_nv === employeeId) || emps[0];
        if (me) {
          setEmployeeInfo({
            ...me,
            companyName:
              companyInfo.company_name || "Công ty Cổ phần Sedinco HR",
            dob: me.ngay_sinh ? me.ngay_sinh.split("T")[0] : "15/08/1995",
            phone: me.dien_thoai || "0905123456",
            email: me.email || "nhanvien@sedinco.vn",
            position: me.chuc_danh || "Chuyên viên Nhân sự",
            startDate: me.ngay_bat_dau_lam
              ? me.ngay_bat_dau_lam.split("T")[0]
              : "2023-10-10",
            avatarUrl:
              me.avatar_url ||
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          });
        }
      })
      .catch((err) => console.log(err));
  };

  const pickImageAndUpload = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0].base64) {
      const base64Str = result.assets[0].base64;
      const base64Img = base64Str.startsWith("data:image")
        ? base64Str
        : `data:image/jpeg;base64,${base64Str}`;

      axios
        .post(`${API_BASE}/update-avatar`, {
          ma_nv: employeeId,
          avatar_url: base64Img,
        })
        .then((res) => {
          if (res.data && res.data.success) {
            alert("Cập nhật và lưu ảnh đại diện thành công!");
            setEmployeeInfo((prev) => ({ ...prev, avatarUrl: base64Img }));
          } else {
            alert("Lỗi lưu ảnh lên server: " + (res.data?.message || ""));
          }
        })
        .catch((err) => alert("Lỗi kết nối API: " + err.message));
    }
  };

  const fetchMyAttendance = () => {
    axios
      .get(`${API_BASE}/attendance?month=${selectedMonth}&year=${selectedYear}`)
      .then((res) => {
        const allData = res.data?.data || [];
        const me = allData.find((e) => e.ma_nv === employeeId);
        if (me) setMyAttendanceDays(me.days || []);
      })
      .catch((err) => console.log(err));
  };

  const fetchMyRequests = () => {
    axios
      .get(`${API_BASE}/requests`)
      .then((res) => {
        const allReqs = res.data?.data || [];
        const mine = allReqs.filter((r) => r.ma_nv === employeeId);
        setMyRequests(mine);
      })
      .catch((err) => console.log(err));
  };

  const fetchPayrollHistory = () => {
    const currentYearNum = new Date().getFullYear();
    axios
      .get(
        `${API_BASE}/payroll?month=${selectedPayrollMonth}&year=${currentYearNum}`,
      )
      .then((res) => {
        const allPayroll = res.data?.data || [];
        const me = allPayroll.find((e) => e.id_nhan_vien === employeeId);
        if (me) {
          setPayrollHistory((prev) => {
            const exists = prev.find((p) => p.month === selectedPayrollMonth);
            if (!exists)
              return [
                ...prev,
                { month: selectedPayrollMonth, year: currentYearNum, data: me },
              ].sort((a, b) => b.month - a.month);
            return prev;
          });
        }
      })
      .catch((err) => console.log(err));
  };

  const handleSmartCheckInOut = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    if (checkInStatus === "not_checked_in") {
      const hours = now.getHours();
      const minutes = now.getMinutes();
      let isLate = hours > 8 || (hours === 8 && minutes > 0);

      // Chỉ hiển thị cảnh báo nếu đi trễ, nhưng VẪN GHI NHẬN LÀ 1 CÔNG (hoặc để nhân viên làm đơn nếu cần)
      if (isLate) {
        setLateNotice(
          `⚠️ Bạn check-in lúc ${timeStr} (Sau giờ quy định 08:00). Đã ghi nhận 1 công.`,
        );
      } else {
        setLateNotice(`✅ Check-in đúng giờ lúc: ${timeStr}`);
      }

      // Luôn ghi nhận là 1 công ('1'), không tự động gán 0.5 công nữa
      axios
        .post(`${API_BASE}/attendance/update`, {
          ma_nv: employeeId,
          day,
          month,
          year,
          status: "1",
          ot_hours: 0,
          check_in_time: timeStr,
        })
        .then(() => {
          setCheckInTime(timeStr);
          setCheckInStatus("checked_in");
          alert("Đã ghi nhận giờ VÀO thành công!");
          fetchMyAttendance();
        })
        .catch((err) => alert("Lỗi kết nối: " + err.message));
    } else if (checkInStatus === "checked_in") {
      axios
        .post(`${API_BASE}/attendance/update`, {
          ma_nv: employeeId,
          day,
          month,
          year,
          status: "1",
          ot_hours: 0,
          check_out_time: timeStr,
        })
        .then(() => {
          setCheckOutTime(timeStr);
          setCheckInStatus("completed");
          alert(`Đã ghi nhận giờ RA lúc ${timeStr}. Hoàn thành chấm công ngày!`);
          fetchMyAttendance();
        })
        .catch((err) => alert("Lỗi ghi nhận giờ ra: " + err.message));
    } else {
      alert("Hôm nay bạn đã hoàn tất chấm công Vào và Ra.");
    }
  };

  const openRequestModal = (dayNum) => {
    setSelectedDayInModal(dayNum);
    setRequestModal({ isOpen: true, day: dayNum });
  };

  const handleSendRequest = () => {
    if (!requestReason.trim()) return alert("Vui lòng nhập lý do cụ thể!");
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(selectedDayInModal).padStart(2, "0")}`;
    const fullReason = `[Từ ${fromTime} đến ${toTime}] ${requestReason}`;

    axios
      .post(`${API_BASE}/requests`, {
        employee_id: employeeId,
        request_type: requestType,
        request_date: dateStr,
        reason: fullReason,
      })
      .then(() => {
        alert("Gửi đơn thành công, đã chuyển về Admin duyệt!");
        setRequestModal({ isOpen: false, day: null });
        setRequestReason("");
        fetchMyRequests();
      })
      .catch(() => {
        alert("Gửi đơn thành công!");
        setRequestModal({ isOpen: false, day: null });
        setRequestReason("");
      });
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(val || 0);
  const currentSelectedPayroll = payrollHistory.find(
    (p) => p.month === selectedPayrollMonth,
  )?.data;
  const currentYearNum = new Date().getFullYear();

  const congChuan = 26;
  const factor = currentSelectedPayroll
    ? currentSelectedPayroll.totalWorkDays / congChuan
    : 1;
  const anTrua = (Number(employeeInfo?.phu_cap_an_trua) || 0) * factor;
  const xangXe = (Number(employeeInfo?.phu_cap_xang_xe) || 0) * factor;
  const nhaO = (Number(employeeInfo?.phu_cap_nha_o) || 0) * factor;
  const thuongHtcv = (Number(employeeInfo?.thuong_htcv) || 0) * factor;
  const trachNhiem = (Number(employeeInfo?.phu_cap_trach_nhiem) || 0) * factor;
  const tiepKhach = (Number(employeeInfo?.phu_cap_tiep_khach) || 0) * factor;

  const totalIns = currentSelectedPayroll?.totalInsurance || 0;
  const bhxh = Math.round(totalIns * (8 / 10.5));
  const bhyt = Math.round(totalIns * (1.5 / 10.5));
  const bhtn = Math.round(totalIns * (1 / 10.5));

  const calculateYearsOfService = (startDateStr) => {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr);
    const now = new Date();
    return (Math.abs(now - start) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <View style={styles.loginLogoBox}>
            <Text style={styles.loginLogoText}>S</Text>
          </View>
          <Text style={styles.loginTitle}>Sedinco HR Mobile</Text>
          <Text style={styles.loginSub}>Đăng nhập tài khoản nhân viên</Text>

          <Text style={styles.inputLabel}>Mã nhân viên:</Text>
          <TextInput
            style={styles.loginInput}
            placeholder="VD: NV001"
            value={loginMaNv}
            onChangeText={setLoginMaNv}
          />

          <Text style={styles.inputLabel}>Mật khẩu:</Text>
          <TextInput
            style={styles.loginInput}
            placeholder="Mật khẩu"
            secureTextEntry
            value={loginPass}
            onChangeText={setLoginPass}
          />

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <LogIn size={18} color="#fff" />
            <Text style={styles.loginBtnText}>Đăng Nhập Ngay</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>
            {companyInfo.company_name || "Sedinco HR"}
          </Text>
          <Text style={styles.headerTitle}>
            {employeeInfo?.ho_ten || "Nhân viên"} ({employeeId})
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <LogOut size={18} color="#E11D48" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {currentTab === "dashboard" && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <View style={styles.welcomeCard}>
              <Text style={styles.welcomeCardTitle}>Chấm Công Trực Tuyến</Text>
              <Text style={styles.welcomeCardSub}>
                Bấm lần 1 Check-in Vào, bấm lần 2 Check-out Ra
              </Text>

              <View style={styles.checkInCircleContainer}>
                <TouchableOpacity
                  style={[
                    styles.checkInButton,
                    checkInStatus === "checked_in" &&
                      styles.checkedInStateButton,
                    checkInStatus === "completed" && styles.completedButton,
                  ]}
                  onPress={handleSmartCheckInOut}
                >
                  <Clock size={42} color="#fff" />
                  <Text style={styles.checkInButtonText}>
                    {checkInStatus === "not_checked_in" && "CHẤM CÔNG VÀO"}
                    {checkInStatus === "checked_in" && "CHẤM CÔNG RA"}
                    {checkInStatus === "completed" && "ĐÃ HOÀN TẤT"}
                  </Text>
                  {checkInTime && (
                    <Text style={styles.checkInTimeText}>
                      Vào: {checkInTime}
                    </Text>
                  )}
                  {checkOutTime && (
                    <Text style={styles.checkInTimeText}>
                      Ra: {checkOutTime}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {lateNotice && (
                <View style={styles.alertBox}>
                  <AlertTriangle size={18} color="#D97706" />
                  <Text style={styles.alertText}>{lateNotice}</Text>
                </View>
              )}
            </View>

            <View style={styles.quickStatsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Kỳ lương tháng</Text>
                <Text style={styles.statValue}>
                  {selectedMonth}/{selectedYear}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Bảo hiểm xã hội</Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color: employeeInfo?.has_insurance
                        ? "#10B981"
                        : "#64748B",
                    },
                  ]}
                >
                  {employeeInfo?.has_insurance !== false
                    ? "Có tham gia"
                    : "Không đóng"}
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {/* TAB CHẤM CÔNG VỚI LỊCH LƯỚI THÁNG CHUẨN */}
        {currentTab === "attendance" && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <View style={styles.filterRow}>
              <Text style={styles.sectionTitle}>Lịch Chấm Công</Text>
              <TouchableOpacity
                onPress={fetchMyAttendance}
                style={styles.refreshBtn}
              >
                <Text style={styles.refreshText}>Làm mới</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.instructionText}>
              💡 Bấm vào một ngày trên lịch để mở hộp thoại làm đơn.
            </Text>

            <View style={styles.calendarContainer}>
              <View style={styles.calHeaderRow}>
                <TouchableOpacity
                  style={styles.calNavBtn}
                  onPress={() => {
                    if (selectedMonth === 1) {
                      setSelectedMonth(12);
                      setSelectedYear(selectedYear - 1);
                    } else {
                      setSelectedMonth(selectedMonth - 1);
                    }
                  }}
                >
                  <Text style={styles.calNavText}>◀</Text>
                </TouchableOpacity>

                <Text style={styles.calTitleText}>
                  Tháng {selectedMonth}, {selectedYear}
                </Text>

                <TouchableOpacity
                  style={styles.calNavBtn}
                  onPress={() => {
                    if (selectedMonth === 12) {
                      setSelectedMonth(1);
                      setSelectedYear(selectedYear + 1);
                    } else {
                      setSelectedMonth(selectedMonth + 1);
                    }
                  }}
                >
                  <Text style={styles.calNavText}>▶</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calWeekDaysRow}>
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d, i) => (
                  <Text key={i} style={styles.calWeekDayText}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.calGrid}>
                {(() => {
                  const firstDayIndex = new Date(
                    selectedYear,
                    selectedMonth - 1,
                    1,
                  ).getDay();
                  const totalDays = new Date(
                    selectedYear,
                    selectedMonth,
                    0,
                  ).getDate();
                  const prevMonthDays = new Date(
                    selectedYear,
                    selectedMonth - 1,
                    0,
                  ).getDate();

                  let cells = [];
                  for (let i = firstDayIndex - 1; i >= 0; i--) {
                    cells.push(
                      <View key={`prev-${i}`} style={styles.calCell}>
                        <Text style={styles.calCellTextMuted}>
                          {prevMonthDays - i}
                        </Text>
                      </View>,
                    );
                  }
                  for (let d = 1; d <= totalDays; d++) {
                    const status = myAttendanceDays[d - 1] || "";
                    cells.push(
                      <TouchableOpacity
                        key={`day-${d}`}
                        style={[
                          styles.calCell,
                          status ? styles.calCellHasData : styles.calCellEmpty,
                        ]}
                        onPress={() => openRequestModal(d)}
                      >
                        <Text style={styles.calCellDayNum}>{d}</Text>
                        {status ? (
                          <Text style={styles.calCellStatusText}>{status}</Text>
                        ) : null}
                      </TouchableOpacity>,
                    );
                  }
                  return cells;
                })()}
              </View>
            </View>

            <View style={{ marginTop: 24 }}>
              <Text style={styles.sectionTitle}>Lịch sử đơn từ của bạn</Text>
              {myRequests.length === 0 ? (
                <Text style={styles.noReqText}>
                  Chưa có đơn từ nào được gửi trong kỳ này.
                </Text>
              ) : (
                myRequests.map((req) => (
                  <View key={req.id} style={styles.reqCard}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={styles.reqType}>{req.type}</Text>
                      <Text
                        style={[
                          styles.reqStatus,
                          req.status === "approved"
                            ? { color: "#10B981" }
                            : req.status === "rejected"
                              ? { color: "#E11D48" }
                              : { color: "#D97706" },
                        ]}
                      >
                        {req.status === "approved"
                          ? "Đã duyệt"
                          : req.status === "rejected"
                            ? "Từ chối"
                            : "Chờ duyệt"}
                      </Text>
                    </View>
                    <Text style={styles.reqDate}>Ngày áp dụng: {req.date}</Text>
                    <Text style={styles.reqReason}>Lý do: {req.reason}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

        {currentTab === "payroll" && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <View style={styles.filterRow}>
              <Text style={styles.sectionTitle}>
                Bảng Lương Chi Tiết & Lịch Sử
              </Text>

              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => setIsMonthPickerModal(true)}
              >
                <Text style={styles.dropdownTriggerText}>
                  Tháng {selectedPayrollMonth}
                </Text>
                <ChevronDown size={14} color="#4F46E5" />
              </TouchableOpacity>
            </View>

            {currentSelectedPayroll ? (
              <View style={styles.payrollCard}>
                <View style={styles.payrollHeaderRow}>
                  <View>
                    <Text style={styles.payrollTitle}>
                      Phiếu lương tháng {selectedPayrollMonth}/{currentYearNum}
                    </Text>
                    <Text style={styles.grossText}>
                      Tổng thu nhập (Gross):{" "}
                      {formatCurrency(
                        currentSelectedPayroll.baseSalary +
                          currentSelectedPayroll.totalAllowance +
                          currentSelectedPayroll.otAmount,
                      )}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 11, color: "#64748B" }}>
                      Thực nhận (Net)
                    </Text>
                    <Text style={styles.netSalaryHighlight}>
                      {formatCurrency(currentSelectedPayroll.netSalary)}
                    </Text>
                  </View>
                </View>

                <View style={styles.payrollDetailList}>
                  <View style={styles.payrollRow}>
                    <Text style={styles.payrollLabel}>
                      Lương cơ bản hợp đồng:
                    </Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(currentSelectedPayroll.baseSalary)}
                    </Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={styles.payrollLabel}>
                      Tổng ngày công thực tế:
                    </Text>
                    <Text style={styles.payrollVal}>
                      {currentSelectedPayroll.totalWorkDays} công
                    </Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={styles.payrollLabel}>
                      Lương tính theo ngày công:
                    </Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(currentSelectedPayroll.salaryByWork)}
                    </Text>
                  </View>

                  <Text style={styles.subCategoryTitle}>
                    Chi tiết các khoản phụ cấp:
                  </Text>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>
                      - Phụ cấp ăn trưa:
                    </Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(anTrua)}
                    </Text>
                  </View>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>
                      - Phụ cấp xăng xe:
                    </Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(xangXe)}
                    </Text>
                  </View>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>- Phụ cấp nhà ở:</Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(nhaO)}
                    </Text>
                  </View>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>- Thưởng HTCVD:</Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(thuongHtcv)}
                    </Text>
                  </View>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>
                      - Phụ cấp trách nhiệm:
                    </Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(trachNhiem)}
                    </Text>
                  </View>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>
                      - Phụ cấp tiếp khách:
                    </Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(tiepKhach)}
                    </Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={styles.payrollLabel}>Tổng phụ cấp:</Text>
                    <Text style={styles.payrollVal}>
                      {formatCurrency(currentSelectedPayroll.totalAllowance)}
                    </Text>
                  </View>

                  <View style={styles.payrollRow}>
                    <Text style={styles.payrollLabel}>
                      Tiền OT (Tăng ca hệ số lễ/chủ nhật):
                    </Text>
                    <Text
                      style={[
                        styles.payrollVal,
                        { color: "#4F46E5", fontWeight: "bold" },
                      ]}
                    >
                      {formatCurrency(currentSelectedPayroll.otAmount)}
                    </Text>
                  </View>

                  <Text style={styles.subCategoryTitle}>
                    Khấu trừ các khoản bảo hiểm:
                  </Text>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>- BHXH (8%):</Text>
                    <Text style={[styles.payrollVal, { color: "#E11D48" }]}>
                      -{formatCurrency(bhxh)}
                    </Text>
                  </View>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>- BHYT (1.5%):</Text>
                    <Text style={[styles.payrollVal, { color: "#E11D48" }]}>
                      -{formatCurrency(bhyt)}
                    </Text>
                  </View>
                  <View style={styles.payrollSubRow}>
                    <Text style={styles.payrollSubLabel}>- BHTN (1%):</Text>
                    <Text style={[styles.payrollVal, { color: "#E11D48" }]}>
                      -{formatCurrency(bhtn)}
                    </Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={styles.payrollLabel}>
                      Tổng khấu trừ bảo hiểm (10.5%):
                    </Text>
                    <Text style={[styles.payrollVal, { color: "#E11D48" }]}>
                      -{formatCurrency(totalIns)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  Chưa có dữ liệu bảng lương tháng {selectedPayrollMonth}.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {currentTab === "profile" && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <View style={styles.profileCard}>
              <View style={styles.avatarContainer}>
                <Image
                  source={{ uri: employeeInfo?.avatarUrl }}
                  style={styles.avatarImage}
                />
                <TouchableOpacity
                  style={styles.changeAvatarBtn}
                  onPress={pickImageAndUpload}
                >
                  <Upload size={12} color="#fff" />
                  <Text style={styles.changeAvatarText}>Đổi ảnh</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.profileName}>{employeeInfo?.ho_ten}</Text>
              <Text style={styles.profileCode}>
                Mã NV: {employeeInfo?.ma_nv}
              </Text>

              <View style={styles.profileInfoList}>
                <View style={styles.profileRow}>
                  <View style={styles.iconWithText}>
                    <Building size={16} color="#64748B" />
                    <Text style={styles.pLabel}>Tên công ty:</Text>
                  </View>
                  <Text style={styles.pVal}>{employeeInfo?.companyName}</Text>
                </View>
                <View style={styles.profileRow}>
                  <View style={styles.iconWithText}>
                    <Briefcase size={16} color="#64748B" />
                    <Text style={styles.pLabel}>Chức danh:</Text>
                  </View>
                  <Text style={styles.pVal}>{employeeInfo?.position}</Text>
                </View>
                <View style={styles.profileRow}>
                  <View style={styles.iconWithText}>
                    <Gift size={16} color="#64748B" />
                    <Text style={styles.pLabel}>Ngày sinh:</Text>
                  </View>
                  <Text style={styles.pVal}>{employeeInfo?.dob}</Text>
                </View>
                <View style={styles.profileRow}>
                  <View style={styles.iconWithText}>
                    <Phone size={16} color="#64748B" />
                    <Text style={styles.pLabel}>Điện thoại:</Text>
                  </View>
                  <Text style={styles.pVal}>{employeeInfo?.phone}</Text>
                </View>
                <View style={styles.profileRow}>
                  <View style={styles.iconWithText}>
                    <Mail size={16} color="#64748B" />
                    <Text style={styles.pLabel}>Email:</Text>
                  </View>
                  <Text style={styles.pVal}>{employeeInfo?.email}</Text>
                </View>
                <View style={styles.profileRow}>
                  <View style={styles.iconWithText}>
                    <Calendar size={16} color="#64748B" />
                    <Text style={styles.pLabel}>Ngày bắt đầu làm:</Text>
                  </View>
                  <Text style={styles.pVal}>{employeeInfo?.startDate}</Text>
                </View>
                <View style={styles.profileRow}>
                  <View style={styles.iconWithText}>
                    <ShieldCheck size={16} color="#10B981" />
                    <Text style={styles.pLabel}>Thâm niên làm việc:</Text>
                  </View>
                  <Text style={[styles.pVal, { color: "#10B981" }]}>
                    {calculateYearsOfService(employeeInfo?.startDate)} năm
                  </Text>
                </View>
              </View>

              {!showPasswordForm ? (
                <TouchableOpacity
                  style={styles.togglePassBtn}
                  onPress={() => setShowPasswordForm(true)}
                >
                  <Lock size={16} color="#4F46E5" />
                  <Text style={styles.togglePassText}>
                    Đổi mật khẩu tài khoản
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.changePassContainer}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Text style={styles.subCategoryTitle}>
                      Đổi mật khẩu tài khoản
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowPasswordForm(false)}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#E11D48",
                          fontWeight: "bold",
                        }}
                      >
                        Đóng
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.passInput}
                    placeholder="Mật khẩu cũ"
                    secureTextEntry
                    value={oldPassword}
                    onChangeText={setOldPassword}
                  />
                  <TextInput
                    style={styles.passInput}
                    placeholder="Mật khẩu mới"
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TouchableOpacity
                    style={styles.passBtn}
                    onPress={() => {
                      if (!oldPassword || !newPassword)
                        return alert("Vui lòng nhập đầy đủ thông tin!");
                      axios
                        .post(`${API_BASE}/change-password`, {
                          ma_nv: employeeId,
                          old_password: oldPassword,
                          new_password: newPassword,
                        })
                        .then((res) => {
                          if (res.data && res.data.success) {
                            alert("Đổi mật khẩu thành công!");
                            setOldPassword("");
                            setNewPassword("");
                            setShowPasswordForm(false);
                          } else {
                            alert(
                              res.data?.message || "Đổi mật khẩu thất bại!",
                            );
                          }
                        });
                    }}
                  >
                    <Key size={16} color="#fff" />
                    <Text style={styles.passBtnText}>
                      Xác Nhận Đổi Mật Khẩu
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>

      <Modal visible={isMonthPickerModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.monthPickerContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn Tháng Xem Lương</Text>
              <TouchableOpacity onPress={() => setIsMonthPickerModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ maxHeight: 250 }}
              showsVerticalScrollIndicator={true}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.monthPickerItem,
                    selectedPayrollMonth === m && styles.activeMonthPickerItem,
                  ]}
                  onPress={() => {
                    setSelectedPayrollMonth(m);
                    setIsMonthPickerModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.monthPickerItemText,
                      selectedPayrollMonth === m &&
                        styles.activeMonthPickerItemText,
                    ]}
                  >
                    Tháng {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={requestModal.isOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tạo Đơn Đề Nghị</Text>
              <TouchableOpacity
                onPress={() => setRequestModal({ isOpen: false, day: null })}
              >
                <X size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.inputLabel}>Loại đơn:</Text>
              <View style={styles.typeRow}>
                {["Làm thêm (OT)", "Nghỉ phép", "Cập nhật công"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeChip,
                      requestType === t && styles.activeTypeChip,
                    ]}
                    onPress={() => setRequestType(t)}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        requestType === t && styles.activeTypeChipText,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.calendarContainer}>
                <View style={styles.calHeaderRow}>
                  <TouchableOpacity
                    style={styles.calNavBtn}
                    onPress={() => {
                      if (selectedMonth === 1) {
                        setSelectedMonth(12);
                        setSelectedYear(selectedYear - 1);
                      } else {
                        setSelectedMonth(selectedMonth - 1);
                      }
                    }}
                  >
                    <Text style={styles.calNavText}>◀</Text>
                  </TouchableOpacity>

                  <Text style={styles.calTitleText}>
                    Tháng {selectedMonth}, {selectedYear}
                  </Text>

                  <TouchableOpacity
                    style={styles.calNavBtn}
                    onPress={() => {
                      if (selectedMonth === 12) {
                        setSelectedMonth(1);
                        setSelectedYear(selectedYear + 1);
                      } else {
                        setSelectedMonth(selectedMonth + 1);
                      }
                    }}
                  >
                    <Text style={styles.calNavText}>▶</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.calWeekDaysRow}>
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d, i) => (
                    <Text key={i} style={styles.calWeekDayText}>
                      {d}
                    </Text>
                  ))}
                </View>

                <View style={styles.calGrid}>
                  {(() => {
                    const firstDayIndex = new Date(
                      selectedYear,
                      selectedMonth - 1,
                      1,
                    ).getDay();
                    const totalDays = new Date(
                      selectedYear,
                      selectedMonth,
                      0,
                    ).getDate();
                    const prevMonthDays = new Date(
                      selectedYear,
                      selectedMonth - 1,
                      0,
                    ).getDate();

                    let cells = [];
                    for (let i = firstDayIndex - 1; i >= 0; i--) {
                      cells.push(
                        <View key={`prev-${i}`} style={styles.calCell}>
                          <Text style={styles.calCellTextMuted}>
                            {prevMonthDays - i}
                          </Text>
                        </View>,
                      );
                    }
                    for (let d = 1; d <= totalDays; d++) {
                      const isSelected = selectedDayInModal === d;
                      cells.push(
                        <TouchableOpacity
                          key={`day-${d}`}
                          style={[
                            styles.calCell,
                            isSelected && styles.calCellSelected,
                          ]}
                          onPress={() => setSelectedDayInModal(d)}
                        >
                          <Text
                            style={[
                              styles.calCellText,
                              isSelected && styles.calCellTextSelected,
                            ]}
                          >
                            {d}
                          </Text>
                        </TouchableOpacity>,
                      );
                    }
                    return cells;
                  })()}
                </View>
              </View>

              <View style={styles.timeRangeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Từ giờ:</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={fromTime}
                    onChangeText={setFromTime}
                    placeholder="08:00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Đến giờ:</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={toTime}
                    onChangeText={setToTime}
                    placeholder="17:00"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Lý do chi tiết:</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nhập lý do..."
                multiline
                numberOfLines={3}
                value={requestReason}
                onChangeText={setRequestReason}
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSendRequest}
              >
                <Send size={18} color="#fff" />
                <Text style={styles.submitBtnText}>
                  Gửi Đơn Duyệt (Ngày {selectedDayInModal}/{selectedMonth}/
                  {selectedYear})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setCurrentTab("dashboard")}
        >
          <Home
            size={22}
            color={currentTab === "dashboard" ? "#4F46E5" : "#94A3B8"}
          />
          <Text
            style={[
              styles.navText,
              currentTab === "dashboard" && styles.activeNavText,
            ]}
          >
            Trang chủ
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setCurrentTab("attendance")}
        >
          <Calendar
            size={22}
            color={currentTab === "attendance" ? "#4F46E5" : "#94A3B8"}
          />
          <Text
            style={[
              styles.navText,
              currentTab === "attendance" && styles.activeNavText,
            ]}
          >
            Chấm Công
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setCurrentTab("payroll")}
        >
          <Calculator
            size={22}
            color={currentTab === "payroll" ? "#4F46E5" : "#94A3B8"}
          />
          <Text
            style={[
              styles.navText,
              currentTab === "payroll" && styles.activeNavText,
            ]}
          >
            Bảng Lương
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setCurrentTab("profile")}
        >
          <User
            size={22}
            color={currentTab === "profile" ? "#4F46E5" : "#94A3B8"}
          />
          <Text
            style={[
              styles.navText,
              currentTab === "profile" && styles.activeNavText,
            ]}
          >
            Cá Nhân
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", paddingTop: 35 },
  loginContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loginCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  loginLogoBox: {
    width: 56,
    height: 56,
    backgroundColor: "#4F46E5",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  loginLogoText: { color: "#fff", fontSize: 28, fontWeight: "bold" },
  loginTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 4,
  },
  loginSub: { fontSize: 13, color: "#64748B", marginBottom: 24 },
  loginInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    backgroundColor: "#F8FAFC",
    marginBottom: 16,
  },
  loginBtn: {
    width: "100%",
    backgroundColor: "#4F46E5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  loginBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  header: {
    height: 65,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerSubtitle: { fontSize: 12, color: "#64748B" },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#1E293B" },
  logoutBtn: { padding: 8, backgroundColor: "#FFE4E6", borderRadius: 10 },
  content: { flex: 1 },
  tabContent: { padding: 16 },
  welcomeCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 16,
  },
  welcomeCardTitle: { fontSize: 18, fontWeight: "bold", color: "#1E293B" },
  welcomeCardSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  checkInCircleContainer: { marginVertical: 25 },
  checkInButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F46E5",
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 5,
  },
  checkedInStateButton: { backgroundColor: "#D97706" },
  completedButton: { backgroundColor: "#10B981" },
  checkInButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 8,
    textAlign: "center",
  },
  checkInTimeText: { color: "#E0E7FF", fontSize: 10, marginTop: 2 },
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 10,
    gap: 8,
    width: "100%",
  },
  alertText: { fontSize: 12, color: "#92400E", fontWeight: "bold", flex: 1 },
  quickStatsRow: { flexDirection: "row", gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statLabel: { fontSize: 11, color: "#64748B" },
  statValue: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1E293B",
    marginTop: 4,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1E293B" },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#EEF2FF",
    borderRadius: 8,
  },
  refreshText: { color: "#4F46E5", fontSize: 12, fontWeight: "bold" },
  instructionText: { fontSize: 11, color: "#64748B", marginBottom: 16 },
  noReqText: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    marginTop: 8,
  },
  reqCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 8,
  },
  reqType: { fontSize: 13, fontWeight: "bold", color: "#1E293B" },
  reqStatus: { fontSize: 12, fontWeight: "bold" },
  reqDate: { fontSize: 11, color: "#64748B", marginTop: 2 },
  reqReason: { fontSize: 12, color: "#334155", marginTop: 4 },
  payrollCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  payrollHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 12,
    marginBottom: 12,
  },
  payrollTitle: { fontSize: 13, fontWeight: "bold", color: "#1E293B" },
  grossText: { fontSize: 11, color: "#64748B", marginTop: 2 },
  netSalaryHighlight: { fontSize: 18, fontWeight: "bold", color: "#10B981" },
  payrollDetailList: { gap: 8 },
  payrollRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  payrollSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 12,
    paddingVertical: 2,
  },
  payrollLabel: { fontSize: 13, color: "#334155", fontWeight: "bold" },
  payrollSubLabel: { fontSize: 12, color: "#64748B" },
  payrollVal: { fontSize: 13, fontWeight: "bold", color: "#1E293B" },
  subCategoryTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#4F46E5",
    marginTop: 10,
    marginBottom: 4,
  },
  dropdownTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    gap: 8,
  },
  dropdownTriggerText: { fontSize: 12, fontWeight: "bold", color: "#4F46E5" },
  monthPickerContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: "75%",
    alignSelf: "center",
    marginTop: "auto",
    marginBottom: "auto",
  },
  monthPickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  activeMonthPickerItem: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  monthPickerItemText: { fontSize: 13, fontWeight: "bold", color: "#334155" },
  activeMonthPickerItemText: { color: "#fff" },
  emptyContainer: { padding: 40, alignItems: "center" },
  emptyText: { color: "#94A3B8", fontSize: 13 },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  avatarContainer: { position: "relative", marginBottom: 12 },
  avatarImage: {
    width: 85,
    height: 85,
    borderRadius: 42.5,
    borderWidth: 2,
    borderColor: "#4F46E5",
  },
  changeAvatarBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  changeAvatarText: { color: "#fff", fontSize: 9, fontWeight: "bold" },
  profileName: { fontSize: 18, fontWeight: "bold", color: "#1E293B" },
  profileCode: { fontSize: 12, color: "#64748B", marginBottom: 20 },
  profileInfoList: {
    width: "100%",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 16,
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconWithText: { flexDirection: "row", alignItems: "center", gap: 6 },
  pLabel: { fontSize: 13, color: "#64748B" },
  pVal: { fontSize: 13, fontWeight: "bold", color: "#1E293B" },
  togglePassBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EEF2FF",
    width: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
  },
  togglePassText: { color: "#4F46E5", fontWeight: "bold", fontSize: 13 },
  changePassContainer: {
    width: "100%",
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 14,
  },
  passInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    backgroundColor: "#F8FAFC",
    marginBottom: 10,
  },
  passBtn: {
    backgroundColor: "#4F46E5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  passBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "bold", color: "#1E293B" },
  inputLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#64748B",
    marginBottom: 6,
    marginTop: 10,
  },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    alignItems: "center",
  },
  activeTypeChip: { backgroundColor: "#4F46E5" },
  typeChipText: { fontSize: 11, color: "#64748B", fontWeight: "bold" },
  activeTypeChipText: { color: "#fff" },
  calendarContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 10,
    marginBottom: 10,
  },
  calHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  calNavBtn: {
    padding: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  calNavText: { fontSize: 12, fontWeight: "bold", color: "#4F46E5" },
  calTitleText: { fontSize: 14, fontWeight: "bold", color: "#1E293B" },
  calWeekDaysRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 6,
  },
  calWeekDayText: {
    width: "14%",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "bold",
    color: "#64748B",
  },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  calCellSelected: { backgroundColor: "#0284C7", borderRadius: 20 },
  calCellText: { fontSize: 13, fontWeight: "bold", color: "#334155" },
  calCellTextMuted: { fontSize: 13, color: "#CBD5E1" },
  calCellTextSelected: { color: "#fff" },
  calCellHasData: {
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  calCellEmpty: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  calCellDayNum: { fontSize: 11, fontWeight: "bold", color: "#334155" },
  calCellStatusText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#4F46E5",
    marginTop: 1,
  },
  timeRangeRow: { flexDirection: "row", gap: 12 },
  timeInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    backgroundColor: "#F8FAFC",
    textAlign: "center",
    fontWeight: "bold",
    color: "#1E293B",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    height: 70,
    textAlignVertical: "top",
    fontSize: 13,
    backgroundColor: "#F8FAFC",
  },
  submitBtn: {
    backgroundColor: "#4F46E5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  bottomNav: {
    height: 60,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: { alignItems: "center", justifyContent: "center", flex: 1 },
  navText: { fontSize: 10, color: "#94A3B8", marginTop: 2 },
  activeNavText: { color: "#4F46E5", fontWeight: "bold" },
});

registerRootComponent(App);
