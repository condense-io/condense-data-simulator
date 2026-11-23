
import { publishKafka } from "./publishToKafka.js";

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 2000);

const assets = [
    "TRUCK_001",
    "TRUCK_002",
    "TRUCK_003",
    "TRUCK_004",
    "TRUCK_005"
];

const deviceIds = [
    "TCU_001",
    "TCU_002",
    "TCU_003",
    "TCU_004",
    "TCU_005"
];

const deviceInitialLocation = {
    TRUCK_001: { latitude: 11.895878, longitude: 75.734179 },
    TRUCK_002: { latitude: 13.006892, longitude: 74.793085 },
    TRUCK_003: { latitude: 17.883957, longitude: 77.513889 },
    TRUCK_004: { latitude: 18.530619, longitude: 73.854831 },
    TRUCK_005: { latitude: 28.359374, longitude: 79.416781 }
};

const fleetConfig = {
    assetType: "heavy_vehicle",
    makeModel: "Tata Signa 4825",

    initialValues: {
        speed_kmh: 68.5,
        heading_deg: 145.6,
        altitude_m: 912.4,
        engine_rpm: 1850,
        engine_temp_c: 93.7,
        coolant_temp_c: 88.2,
        throttle_position_pct: 36.5,
        fuel_level_pct: 42,
        fuel_consumption_lph: 8.4,
        odometer_km: 100758.002,
        trip_distance_km: 124.5,
        battery_voltage: 13.8,
        ambient_temp_c: 31.5,
        tyre_pressure_front_psi: 98.2,
        tyre_pressure_rear_psi: 102.4,
    }
};

const vehicleStates = new Map();

const randomBetween = (min, max) =>
    Math.random() * (max - min) + min;

const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

const round = (value, decimals = 2) =>
    Number(value.toFixed(decimals));

// Initialize each vehicle only once
const initializeVehicles = () => {
    assets.forEach((vehicleId, index) => {
        const location = deviceInitialLocation[vehicleId];

        if (!location) {
            throw new Error(`Missing location for ${vehicleId}`);
        }

        vehicleStates.set(vehicleId, {
            ...fleetConfig.initialValues,

            latitude: location.latitude,
            longitude: location.longitude,

            ignition_on: true,

            previousTimestamp: Date.now()
        });
    });
};

// Generate telemetry for an individual vehicle
const generateFleetData = (vehicleId) => {
    const index = assets.indexOf(vehicleId);

    if (index === -1) {
        throw new Error(`Unknown vehicle: ${vehicleId}`);
    }

    const state = vehicleStates.get(vehicleId);

    if (!state) {
        throw new Error(`Vehicle not initialized: ${vehicleId}`);
    }

    const now = Date.now();

    const deltaHours =
        (now - state.previousTimestamp) / 3600000;

    // Work with a separate object
    const fleetObj = { ...state };

    fleetObj.previousTimestamp = now;

    // Vehicle speed
    fleetObj.speed_kmh = clamp(
        state.speed_kmh + randomBetween(-4, 4),
        0,
        100
    );

    // Simulate occasional stopping
    if (Math.random() < 0.02) {
        fleetObj.speed_kmh = 0;
    }

    // Heading
    fleetObj.heading_deg =
        (state.heading_deg + randomBetween(-3, 3) + 360) % 360;

    // Keep ignition consistent with movement
    fleetObj.ignition_on = state.ignition_on;

    // Engine RPM
    const targetRpm = fleetObj.speed_kmh === 0
        ? (fleetObj.ignition_on ? 750 : 0)
        : 750 + fleetObj.speed_kmh * 16;

    fleetObj.engine_rpm = clamp(
        state.engine_rpm +
        (targetRpm - state.engine_rpm) * 0.3 +
        randomBetween(-30, 30),
        0,
        2800
    );

    // Engine temperature
    fleetObj.engine_temp_c = clamp(
        state.engine_temp_c + randomBetween(-0.3, 0.3),
        75,
        115
    );

    // Coolant temperature
    fleetObj.coolant_temp_c = clamp(
        state.coolant_temp_c + randomBetween(-0.2, 0.2),
        70,
        105
    );

    fleetObj.throttle_position_pct =
        fleetObj.speed_kmh === 0
            ? 0
            : clamp(
                fleetObj.speed_kmh * 0.5 + randomBetween(-8, 8),
                5,
                100
            );

    const fuelConsumption =
        fleetObj.speed_kmh === 0
            ? 0.8
            : 5 + fleetObj.speed_kmh * 0.05;

    fleetObj.fuel_consumption_lph = fuelConsumption;

    if (fleetObj.ignition_on) {
        const fuelConsumedLitres =
            fuelConsumption * deltaHours;

        // Assuming a 400-litre fuel tank
        fleetObj.fuel_level_pct = clamp(
            state.fuel_level_pct -
            (fuelConsumedLitres / 400 * 100),
            0,
            100
        );
    }

    const distance = fleetObj.speed_kmh * deltaHours;

    fleetObj.odometer_km = state.odometer_km + distance;

    fleetObj.trip_distance_km =
        state.trip_distance_km + distance;

    const earthRadius = 6371000;

    const headingRad =
        fleetObj.heading_deg * Math.PI / 180;

    const distanceMeters = distance * 1000;

    const latitudeRad =
        state.latitude * Math.PI / 180;

    const deltaLat =
        (distanceMeters * Math.cos(headingRad)) / earthRadius;

    const deltaLon =
        (distanceMeters * Math.sin(headingRad)) /
        (earthRadius * Math.cos(latitudeRad));

    fleetObj.latitude =
        state.latitude + deltaLat * 180 / Math.PI;

    fleetObj.longitude =
        state.longitude + deltaLon * 180 / Math.PI;

    fleetObj.battery_voltage = clamp(
        state.battery_voltage + randomBetween(-0.05, 0.05),
        12.2,
        14.5
    );

    fleetObj.tyre_pressure_front_psi = clamp(
        state.tyre_pressure_front_psi + randomBetween(-0.1, 0.1),
        85,
        110
    );

    fleetObj.tyre_pressure_rear_psi = clamp(
        state.tyre_pressure_rear_psi + randomBetween(-0.1, 0.1),
        85,
        110
    );

    vehicleStates.set(vehicleId, fleetObj);

    return {
        schema_version: "1.0",
        event_type: "fleet_telemetry",
        asset_id: vehicleId,
        asset_type: fleetConfig.assetType,
        device_id: deviceIds[index],
        make_model: fleetConfig.makeModel,
        timestamp: new Date(now).toISOString(),
        speed_kmh: round(fleetObj.speed_kmh),
        heading_deg: round(fleetObj.heading_deg),
        altitude_m: round(fleetObj.altitude_m),
        engine_rpm: Math.round(fleetObj.engine_rpm),
        engine_temp_c: round(fleetObj.engine_temp_c),
        coolant_temp_c: round(fleetObj.coolant_temp_c),
        throttle_position_pct: round(
            fleetObj.throttle_position_pct
        ),
        fuel_level_pct: round(fleetObj.fuel_level_pct),
        fuel_consumption_lph: round(fleetObj.fuel_consumption_lph),
        odometer_km: round(fleetObj.odometer_km, 3),
        trip_distance_km: round(fleetObj.trip_distance_km, 3),
        ignition_on: fleetObj.ignition_on,
        battery_voltage: round(fleetObj.battery_voltage),
        ambient_temp_c: round(fleetObj.ambient_temp_c),
        tyre_pressure_front_psi: round(
            fleetObj.tyre_pressure_front_psi
        ),
        tyre_pressure_rear_psi: round(
            fleetObj.tyre_pressure_rear_psi
        ),
        gps: {
            latitude: round(fleetObj.latitude, 6),
            longitude: round(fleetObj.longitude, 6),
            accuracy_m: round(randomBetween(2, 5))
        }
    };
};

// Start simulator
export const fleetDataSimulator = () => {
    console.info("Starting Fleet Data Simulator...");

    initializeVehicles();

    setInterval(async () => {
        for (const vehicleId of assets) {
            try {
                const data = generateFleetData(vehicleId);

                console.info(
                    `Telemetry generated for ${vehicleId}:`,
                    data
                );

                await publishKafka(
                    JSON.stringify(data),
                    data.asset_id
                );

            } catch (error) {
                console.error(
                    `Fleet simulator error for ${vehicleId}:`,
                    error
                );
            }
        }
    }, INTERVAL_MS);

    console.info(
        `Fleet simulator running. Interval: ${INTERVAL_MS}ms`
    );
};
