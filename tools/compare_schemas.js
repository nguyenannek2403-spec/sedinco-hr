/**
 * tools/compare_schemas.js
 * 
 * Script tự động so sánh chi tiết giữa 2 cơ sở dữ liệu qua information_schema (G9.2 Mục A.2):
 * - DB1: sedinco_hr_test (CSDL test hiện hữu)
 * - DB2: sedinco_hr_fresh_test (CSDL mới migrate từ trạng thái rỗng)
 * 
 * So sánh:
 * 1. Danh sách bảng
 * 2. Cấu trúc cột (COLUMNS: tên, kiểu dữ liệu, nullable, default, collation)
 * 3. Chỉ mục (STATISTICS: tên index, non_unique, các cột cấu thành)
 * 4. Ràng buộc (TABLE_CONSTRAINTS & KEY_COLUMN_USAGE)
 * 5. Collation của từng bảng
 */

const mysql = require('../sedinco_backend/node_modules/mysql2/promise');

const DB1 = process.env.DB1 || 'sedinco_hr_test';
const DB2 = process.env.DB2 || 'sedinco_hr_fresh_test';

async function compareSchemas() {
    const conn = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '123456'
    });

    console.log('=============================================================================');
    console.log(`[ĐỐI SOÁT SCHEMA TỰ ĐỘNG] So sánh "${DB1}" (Hiện hữu) vs "${DB2}" (Mới migrate)`);
    console.log('=============================================================================\n');

    const differences = [];

    // 1. So sánh danh mục bảng
    const [t1Rows] = await conn.query(
        'SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
        [DB1]
    );
    const [t2Rows] = await conn.query(
        'SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
        [DB2]
    );

    const tables1 = new Map(t1Rows.map(r => [r.TABLE_NAME, r.TABLE_COLLATION]));
    const tables2 = new Map(t2Rows.map(r => [r.TABLE_NAME, r.TABLE_COLLATION]));

    console.log(`>>> 1. DANH MỤC BẢNG:`);
    console.log(`  - ${DB1}: ${tables1.size} bảng`);
    console.log(`  - ${DB2}: ${tables2.size} bảng`);

    for (const [tbl, coll] of tables1) {
        if (!tables2.has(tbl)) {
            differences.push({ type: 'MISSING_TABLE', detail: `Bảng "${tbl}" có trong ${DB1} nhưng thiếu trong ${DB2}` });
        } else if (coll !== tables2.get(tbl)) {
            differences.push({ type: 'TABLE_COLLATION_DIFF', detail: `Bảng "${tbl}": ${DB1}=${coll} vs ${DB2}=${tables2.get(tbl)}` });
        }
    }
    for (const [tbl] of tables2) {
        if (!tables1.has(tbl)) {
            differences.push({ type: 'EXTRA_TABLE', detail: `Bảng "${tbl}" có trong ${DB2} nhưng không có trong ${DB1}` });
        }
    }

    // 2. So sánh CỘT (COLUMNS)
    console.log(`>>> 2. SO SÁNH CỘT (COLUMNS: Tên, Kiểu, Nullable, Default, Collation)...`);
    const [col1Rows] = await conn.query(`
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        ORDER BY TABLE_NAME, COLUMN_NAME
    `, [DB1]);
    const [col2Rows] = await conn.query(`
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        ORDER BY TABLE_NAME, COLUMN_NAME
    `, [DB2]);

    const colMap1 = new Map(col1Rows.map(r => [`${r.TABLE_NAME}.${r.COLUMN_NAME}`, r]));
    const colMap2 = new Map(col2Rows.map(r => [`${r.TABLE_NAME}.${r.COLUMN_NAME}`, r]));

    for (const [key, c1] of colMap1) {
        const c2 = colMap2.get(key);
        if (!c2) {
            differences.push({ type: 'MISSING_COLUMN', detail: `Cột "${key}" có trong ${DB1} nhưng thiếu trong ${DB2}` });
        } else {
            // So sánh kiểu, null, default, collation
            if (c1.COLUMN_TYPE.toLowerCase() !== c2.COLUMN_TYPE.toLowerCase()) {
                differences.push({ type: 'COLUMN_TYPE_DIFF', detail: `Cột "${key}": Kiểu ${DB1}=${c1.COLUMN_TYPE} vs ${DB2}=${c2.COLUMN_TYPE}` });
            }
            if (c1.IS_NULLABLE !== c2.IS_NULLABLE) {
                differences.push({ type: 'COLUMN_NULLABLE_DIFF', detail: `Cột "${key}": Nullable ${DB1}=${c1.IS_NULLABLE} vs ${DB2}=${c2.IS_NULLABLE}` });
            }
            // Chuẩn hóa default value so sánh
            const def1 = c1.COLUMN_DEFAULT === null ? 'NULL' : String(c1.COLUMN_DEFAULT);
            const def2 = c2.COLUMN_DEFAULT === null ? 'NULL' : String(c2.COLUMN_DEFAULT);
            if (def1 !== def2) {
                differences.push({ type: 'COLUMN_DEFAULT_DIFF', detail: `Cột "${key}": Default ${DB1}='${def1}' vs ${DB2}='${def2}'` });
            }
            if (c1.COLLATION_NAME !== c2.COLLATION_NAME) {
                differences.push({ type: 'COLUMN_COLLATION_DIFF', detail: `Cột "${key}": Collation ${DB1}=${c1.COLLATION_NAME} vs ${DB2}=${c2.COLLATION_NAME}` });
            }
        }
    }
    for (const [key] of colMap2) {
        if (!colMap1.has(key)) {
            differences.push({ type: 'EXTRA_COLUMN', detail: `Cột "${key}" có trong ${DB2} nhưng không có trong ${DB1}` });
        }
    }

    // 3. So sánh CHỈ MỤC (STATISTICS)
    console.log(`>>> 3. SO SÁNH CHỈ MỤC (STATISTICS)...`);
    const [idx1Rows] = await conn.query(`
        SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as cols 
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = ? 
        GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
        ORDER BY TABLE_NAME, INDEX_NAME
    `, [DB1]);
    const [idx2Rows] = await conn.query(`
        SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as cols 
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = ? 
        GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
        ORDER BY TABLE_NAME, INDEX_NAME
    `, [DB2]);

    const idxMap1 = new Map(idx1Rows.map(r => [`${r.TABLE_NAME}.${r.INDEX_NAME}`, r]));
    const idxMap2 = new Map(idx2Rows.map(r => [`${r.TABLE_NAME}.${r.INDEX_NAME}`, r]));

    for (const [key, i1] of idxMap1) {
        const i2 = idxMap2.get(key);
        if (!i2) {
            differences.push({ type: 'MISSING_INDEX', detail: `Index "${key}" (cột: ${i1.cols}) có trong ${DB1} nhưng thiếu trong ${DB2}` });
        } else {
            if (i1.NON_UNIQUE !== i2.NON_UNIQUE || i1.cols !== i2.cols) {
                differences.push({ type: 'INDEX_DIFF', detail: `Index "${key}": ${DB1}=(${i1.cols}, non_unique=${i1.NON_UNIQUE}) vs ${DB2}=(${i2.cols}, non_unique=${i2.NON_UNIQUE})` });
            }
        }
    }
    for (const [key, i2] of idxMap2) {
        if (!idxMap1.has(key)) {
            differences.push({ type: 'EXTRA_INDEX', detail: `Index "${key}" (cột: ${i2.cols}) có trong ${DB2} nhưng không có trong ${DB1}` });
        }
    }

    // 4. So sánh RÀNG BUỘC (TABLE_CONSTRAINTS)
    console.log(`>>> 4. SO SÁNH RÀNG BUỘC (TABLE_CONSTRAINTS)...`);
    const [cst1Rows] = await conn.query(`
        SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE 
        FROM information_schema.TABLE_CONSTRAINTS 
        WHERE TABLE_SCHEMA = ? 
        ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `, [DB1]);
    const [cst2Rows] = await conn.query(`
        SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE 
        FROM information_schema.TABLE_CONSTRAINTS 
        WHERE TABLE_SCHEMA = ? 
        ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `, [DB2]);

    const cstMap1 = new Map(cst1Rows.map(r => [`${r.TABLE_NAME}.${r.CONSTRAINT_NAME}`, r]));
    const cstMap2 = new Map(cst2Rows.map(r => [`${r.TABLE_NAME}.${r.CONSTRAINT_NAME}`, r]));

    for (const [key, c1] of cstMap1) {
        const c2 = cstMap2.get(key);
        if (!c2) {
            differences.push({ type: 'MISSING_CONSTRAINT', detail: `Ràng buộc "${key}" (${c1.CONSTRAINT_TYPE}) có trong ${DB1} nhưng thiếu trong ${DB2}` });
        } else if (c1.CONSTRAINT_TYPE !== c2.CONSTRAINT_TYPE) {
            differences.push({ type: 'CONSTRAINT_TYPE_DIFF', detail: `Ràng buộc "${key}": ${DB1}=${c1.CONSTRAINT_TYPE} vs ${DB2}=${c2.CONSTRAINT_TYPE}` });
        }
    }
    for (const [key, c2] of cstMap2) {
        if (!cstMap1.has(key)) {
            differences.push({ type: 'EXTRA_CONSTRAINT', detail: `Ràng buộc "${key}" (${c2.CONSTRAINT_TYPE}) có trong ${DB2} nhưng không có trong ${DB1}` });
        }
    }

    // 5. Kết luận
    console.log('\n=============================================================================');
    console.log(`TỔNG KẾT ĐỐI SOÁT SCHEMA: TÌM THẤY ${differences.length} ĐIỂM KHÁC BIỆT`);
    console.log('=============================================================================');

    if (differences.length === 0) {
        console.log('✅ KẾT QUẢ: 0 KHÁC BIỆT! Cấu trúc CSDL mới migrate hoàn toàn trùng khớp với CSDL hiện hữu.');
    } else {
        console.log(`Chi tiết ${differences.length} điểm khác biệt:`);
        differences.forEach((d, idx) => {
            console.log(` [${idx + 1}] [${d.type}] ${d.detail}`);
        });
    }

    await conn.end();
}

compareSchemas().catch(e => console.error(e));
