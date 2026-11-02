#!/bin/bash
# =============================================================================
# SEDINCO HR - DATABASE BACKUP SCRIPT (MYSQLDUMP)
# =============================================================================
# Script sao lưu an toàn CSDL bằng mysqldump chính quy thay vì file JSON plaintext.
#
# Đặc điểm kỹ thuật:
# 1. Bảo mật: Dùng MYSQL_PWD trong môi trường tạm thời của subshell, 
#    không hiển thị mật khẩu trên danh sách tiến trình (`ps aux`).
# 2. Toàn vẹn: Dùng cờ --single-transaction (không khóa bảng InnoDB) và --quick.
# 3. Nén dữ liệu: Tự động nén qua gzip (.sql.gz) giúp tiết kiệm dung lượng.
# 4. Kiểm tra: Kiểm tra dung lượng file backup và tính toàn vẹn sau khi xuất.
# =============================================================================

set -e

# Đọc cấu hình từ biến môi trường hoặc file .env nếu có
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-123456}"
DB_NAME="${DB_NAME:-sedinco_hr_test}"

# Thư mục lưu trữ sao lưu
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"

echo "================================================================="
echo "BẮT ĐẦU SAO LƯU CSDL SEDINCO HR BẰNG MYSQLDUMP"
echo "Thời gian: $(date)"
echo "Máy chủ:   ${DB_HOST}:${DB_PORT}"
echo "CSDL:      ${DB_NAME}"
echo "File đích: ${BACKUP_FILE}"
echo "================================================================="

# Thực hiện sao lưu và nén trực tiếp qua gzip
MYSQL_PWD="$DB_PASSWORD" mysqldump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --set-gtid-purged=OFF \
    --default-character-set=utf8mb4 \
    "$DB_NAME" | gzip > "$BACKUP_FILE"

# Kiểm tra kết quả
if [ -s "$BACKUP_FILE" ]; then
    FILE_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    echo "✅ SAO LƯU THÀNH CÔNG!"
    echo "Dung lượng bản sao lưu: $FILE_SIZE"
    echo "Đường dẫn: $BACKUP_FILE"
    
    # Kiểm tra tính toàn vẹn của tệp nén gzip
    if gzip -t "$BACKUP_FILE"; then
        echo "✅ Kiểm tra tính toàn vẹn tệp nén (gzip test): HỢP LỆ"
    else
        echo "❌ Lỗi: Bản sao lưu bị hỏng (corrupted gzip file)!"
        exit 1
    fi
else
    echo "❌ Lỗi: File sao lưu rỗng hoặc không được tạo!"
    exit 1
fi

echo "================================================================="
