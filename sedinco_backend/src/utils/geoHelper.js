/**
 * Tiện ích Địa lý & Khoanh vùng vị trí (Geofencing Utility)
 * Sử dụng công thức Haversine tính khoảng cách cung tròn trên mặt cầu Trái Đất (Độ chính xác mét)
 */

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined ||
        lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
        return Infinity;
    }
    const nLat1 = Number(lat1);
    const nLon1 = Number(lon1);
    const nLat2 = Number(lat2);
    const nLon2 = Number(lon2);
    if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) {
        return Infinity;
    }

    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371e3; // Bán kính trung bình của Trái Đất (mét)
    const phi1 = toRad(nLat1);
    const phi2 = toRad(nLat2);
    const deltaPhi = toRad(nLat2 - nLat1);
    const deltaLambda = toRad(nLon2 - nLon1);

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
}

function isWithinGeofence(userLat, userLng, targetLat, targetLng, radiusMeters = 100) {
    const distance = calculateDistanceMeters(userLat, userLng, targetLat, targetLng);
    return {
        isInside: distance <= radiusMeters,
        distanceMeters: distance,
        allowedRadius: radiusMeters
    };
}

module.exports = {
    calculateDistanceMeters,
    isWithinGeofence
};
