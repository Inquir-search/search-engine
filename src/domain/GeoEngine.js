export default class GeoEngine {
    constructor() { }

    filterByRadius(docs, geoField, centerLat, centerLon, radiusMeters) {
        return docs.filter(doc => {
            if (!doc[geoField] || !Array.isArray(doc[geoField])) return false;
            const [lon, lat] = doc[geoField];
            const d = this._haversine(centerLat, centerLon, lat, lon);
            return d <= radiusMeters;
        });
    }

    filterByBoundingBox(docs, geoField, minLat, maxLat, minLon, maxLon) {
        return docs.filter(doc => {
            if (!doc[geoField] || !Array.isArray(doc[geoField])) return false;
            const [lon, lat] = doc[geoField];
            return (
                lat >= minLat &&
                lat <= maxLat &&
                lon >= minLon &&
                lon <= maxLon
            );
        });
    }

    _haversine(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const toRad = x => (x * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}
