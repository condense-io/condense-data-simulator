import { publishKafka } from "./publishToKafka.js";
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 2000);

const assets = [
    "VAN_011",
    "VAN_012",
    "VAN_013",
    "VAN_014",
    "VAN_015"
];

const deviceIds = [
    "GPS_011",
    "GPS_012",
    "GPS_013",
    "GPS_014",
    "GPS_015"
];

const initialLocations = {
    VAN_011: { latitude: 12.9716, longitude: 77.5946 },
    VAN_012: { latitude: 12.9352, longitude: 77.6245 },
    VAN_013: { latitude: 12.9981, longitude: 77.5502 },
    VAN_014: { latitude: 12.9616, longitude: 77.6387 },
    VAN_015: { latitude: 13.0358, longitude: 77.5970 }
};

const vehicleConfig = {
    assetType: "delivery_van",
    makeModel: "Tata Ace Gold",

    initialValues: {
        altitude_m: 920.5,
        speed_kmh: 42.3,
        heading_deg: 180.5,
        gps_accuracy_m: 2.8,
        satellites_in_view: 11,
        hdop: 1.2,
        fix_type: "3d",
        signal_quality: 85,
        ignition_on: true,
        odometer_km: 45280.5
    }
};

const vehicleStates = new Map();

const randomBetween = (min, max) =>
    Math.random() * (max - min) + min;

const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

const round = (value, decimals = 2) =>
    Number(value.toFixed(decimals));

const initializeVehicles = () => {
    assets.forEach((vehicleId, index) => {
        const location = initialLocations[vehicleId];
        if (!location) {
            throw new Error(
                `Initial location missing for ${vehicleId}`
            );
        }

        const initialState = {
            ...vehicleConfig.initialValues,

            latitude: location.latitude,
            longitude: location.longitude,
            previousTimestamp: Date.now(),
            // Small changes in direction over time
            routeHeading: randomBetween(0, 360),
        };
        vehicleStates.set(vehicleId, initialState);
    });
};

const updateGPSLocation = (state, distanceKm) => {
    const earthRadius = 6371000;
    const distanceMeters = distanceKm * 1000;
    const headingRad =
        state.heading_deg * Math.PI / 180;

    const latitudeRad =
        state.latitude * Math.PI / 180;

    const deltaLat =
        (distanceMeters * Math.cos(headingRad)) /
        earthRadius;

    const deltaLon =
        (distanceMeters * Math.sin(headingRad)) /
        (earthRadius * Math.cos(latitudeRad));

    return {
        latitude:
            state.latitude + deltaLat * 180 / Math.PI,
        longitude:
            state.longitude + deltaLon * 180 / Math.PI
    };
};

const generateVehicleLocation = (vehicleId) => {
    const index = assets.indexOf(vehicleId);
    const state = vehicleStates.get(vehicleId);

    if (!state || index === -1) {
        throw new Error(`Invalid vehicle: ${vehicleId}`);
    }

    const now = Date.now();

    const deltaHours =
        (now - state.previousTimestamp) / 3600000;

    const nextState = { ...state };

    nextState.previousTimestamp = now;

    nextState.speed_kmh = clamp(
        state.speed_kmh + randomBetween(-3, 3),
        0,
        80
    );

    if (Math.random() < 0.02) {
        nextState.speed_kmh = 0;
    }

    nextState.heading_deg = (
        state.heading_deg +
        randomBetween(-8, 8) +
        360
    ) % 360;

    const distanceKm =
        nextState.speed_kmh * deltaHours;

    const location = updateGPSLocation(
        state,
        distanceKm
    );

    nextState.latitude = location.latitude;
    nextState.longitude = location.longitude;

    nextState.altitude_m = clamp(
        state.altitude_m + randomBetween(-1, 1),
        0,
        3000
    );

    nextState.gps_accuracy_m = round(
        randomBetween(1.5, 5)
    );

    nextState.satellites_in_view = Math.round(
        clamp(
            state.satellites_in_view +
            randomBetween(-1, 1),
            4,
            18
        )
    );

    nextState.hdop = round(
        clamp(
            randomBetween(0.7, 2.5),
            0.5,
            10
        )
    );

    nextState.fix_type =
        nextState.satellites_in_view >= 4
            ? "3d"
            : "2d";

    nextState.signal_quality = Math.round(
        clamp(
            100 -
            nextState.hdop * 10 +
            randomBetween(-5, 5),
            0,
            100
        )
    );

    nextState.odometer_km =
        state.odometer_km + distanceKm;

    vehicleStates.set(vehicleId, nextState);

    return {
        schema_version: "1.0",
        event_type: "vehicle_location",
        asset_id: vehicleId,
        asset_type: vehicleConfig.assetType,
        device_id: deviceIds[index],
        timestamp: new Date(now).toISOString(),
        latitude: round(nextState.latitude, 6),
        longitude: round(nextState.longitude, 6),
        altitude_m: round(nextState.altitude_m),
        speed_kmh: round(nextState.speed_kmh),
        heading_deg: round(nextState.heading_deg),
        gps_accuracy_m: nextState.gps_accuracy_m,
        satellites_in_view: nextState.satellites_in_view,
        hdop: nextState.hdop,
        fix_type: nextState.fix_type,
        signal_quality: nextState.signal_quality,
        ignition_on: nextState.ignition_on,
        odometer_km: round(nextState.odometer_km, 3)
    };
};

export const geofenceDataSimulator = () => {
    console.info("Starting Geofence Data Simulator...");
    initializeVehicles();
    setInterval(async () => {
        for (const vehicleId of assets) {
            try {
                const data = generateVehicleLocation(vehicleId);

                console.info(
                    `Geofence data generated for ${vehicleId}:`,
                    data
                );

                await publishKafka(
                    JSON.stringify(data),
                    data.asset_id
                );
            } catch (error) {
                console.error("Error: Geofence Data Simulator", error.toString());
            }
        }
    }, INTERVAL_MS)
}