import { publishKafka } from "./publishToKafka.js";

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 2000);
const EARTH_RADIUS_M = 6_371_000;

const drivers = [
    {
        asset_id: "TRUCK_031",
        device_id: "DMS_031",
        driver_id: "DRV_314",
        trip_id: "TRIP_9081",
        latitude: 12.9716,
        longitude: 77.5946,
    },
    {
        asset_id: "TRUCK_032",
        device_id: "DMS_032",
        driver_id: "DRV_315",
        trip_id: "TRIP_9082",
        latitude: 13.0358,
        longitude: 77.597,
    },
    {
        asset_id: "TRUCK_033",
        device_id: "DMS_033",
        driver_id: "DRV_316",
        trip_id: "TRIP_9083",
        latitude: 12.9352,
        longitude: 77.6245,
    },
    {
        asset_id: "TRUCK_034",
        device_id: "DMS_034",
        driver_id: "DRV_317",
        trip_id: "TRIP_9084",
        latitude: 12.9981,
        longitude: 77.5502,
    },
    {
        asset_id: "TRUCK_035",
        device_id: "DMS_035",
        driver_id: "DRV_318",
        trip_id: "TRIP_9085",
        latitude: 12.9616,
        longitude: 77.6387,
    },
];

const vehicleConfig = {
    asset_type: "heavy_vehicle",
    max_speed_kmh: 100,
    speed_limit_kmh: 80,
};

const randomBetween = (min, max) =>
    Math.random() * (max - min) + min;

const randomInt = (min, max) =>
    Math.floor(randomBetween(min, max + 1));

const randomItem = (items) =>
    items[Math.floor(Math.random() * items.length)];

const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

const round = (value, decimals = 2) =>
    Number(value.toFixed(decimals));

const vehicleStates = new Map();

const drivingScenarios = [
    "normal",
    "normal",
    "normal",
    "harsh_acceleration",
    "harsh_braking",
    "sharp_turn",
    "distracted",
    "drowsy",
];

function initializeDrivers() {
    for (const driver of drivers) {
        vehicleStates.set(driver.asset_id, {
            ...driver,

            speed_kmh: randomBetween(35, 65),
            heading_deg: randomBetween(0, 360),

            accelerator_position_pct: 35,
            brake_pedal_position_pct: 0,
            steering_angle_deg: 0,
            steering_rate_deg_per_sec: 0,

            longitudinal_acceleration_mps2: 0,
            lateral_acceleration_mps2: 0,
            vertical_acceleration_mps2: 0,
            yaw_rate_deg_per_sec: 0,

            abs_active: false,
            traction_control_active: false,
            seatbelt_fastened: true,

            driver_monitoring: {
                eyes_closed: false,
                blink_duration_ms: 150,
                head_pose_yaw_deg: 0,
                head_pose_pitch_deg: 0,
                phone_detected: false,
                face_visibility_pct: 98,
            },

            scenario: "normal",
            scenario_ticks_remaining: 0,

            previous_timestamp: Date.now(),
        });
    }
}

function updateLocation(state, distanceKm) {
    const headingRad =
        (state.heading_deg * Math.PI) / 180;

    const distanceM = distanceKm * 1000;
    const latitudeRad =
        (state.latitude * Math.PI) / 180;

    const deltaLatitude =
        (distanceM * Math.cos(headingRad)) /
        EARTH_RADIUS_M;

    const deltaLongitude =
        (distanceM * Math.sin(headingRad)) /
        (EARTH_RADIUS_M * Math.cos(latitudeRad));

    state.latitude +=
        (deltaLatitude * 180) / Math.PI;

    state.longitude +=
        (deltaLongitude * 180) / Math.PI;
}

function selectDrivingScenario(state) {
    if (state.scenario_ticks_remaining > 0) {
        state.scenario_ticks_remaining -= 1;
        return state.scenario;
    }

    state.scenario = randomItem(drivingScenarios);

    const duration = {
        normal: randomInt(5, 15),
        harsh_acceleration: randomInt(1, 3),
        harsh_braking: randomInt(1, 2),
        sharp_turn: randomInt(1, 3),
        distracted: randomInt(3, 6),
        drowsy: randomInt(3, 8),
    };

    state.scenario_ticks_remaining =
        duration[state.scenario];

    return state.scenario;
}

function updateDrivingBehavior(state, scenario, deltaSeconds) {
    const previousSpeed = state.speed_kmh;

    let acceleration = randomBetween(-0.4, 0.5);
    let brake = 0;
    let accelerator = randomBetween(25, 55);

    let steeringAngle = randomBetween(-8, 8);
    let lateralAcceleration = randomBetween(-0.3, 0.3);
    let verticalAcceleration = randomBetween(-0.15, 0.15);

    let yawRate = randomBetween(-2, 2);

    switch (scenario) {
        case "harsh_acceleration":
            acceleration = randomBetween(2.5, 3.5);
            accelerator = randomBetween(85, 100);
            brake = 0;
            break;

        case "harsh_braking":
            acceleration = randomBetween(-4.5, -3);
            accelerator = 0;
            brake = randomBetween(75, 100);
            break;

        case "sharp_turn":
            acceleration = randomBetween(-0.5, 0.5);
            steeringAngle = randomBetween(-45, 45);
            lateralAcceleration = randomBetween(-3.5, 3.5);
            yawRate = randomBetween(-18, 18);
            break;

        case "distracted":
            accelerator = randomBetween(20, 65);
            steeringAngle = randomBetween(-20, 20);
            lateralAcceleration = randomBetween(-1.2, 1.2);
            break;

        case "drowsy":
            accelerator = randomBetween(15, 40);
            steeringAngle = randomBetween(-15, 15);
            break;

        default:
            break;
    }

    const nextSpeed =
        previousSpeed + acceleration * deltaSeconds * 3.6;

    state.speed_kmh = clamp(
        nextSpeed,
        0,
        vehicleConfig.max_speed_kmh
    );

    if (state.speed_kmh === 0) {
        acceleration = Math.max(0, acceleration);
        brake = 0;
    }

    state.accelerator_position_pct =
        clamp(accelerator, 0, 100);

    state.brake_pedal_position_pct =
        clamp(brake, 0, 100);

    state.brake_pressure_bar =
        brake > 0
            ? (brake / 100) * 120
            : 0;

    state.steering_angle_deg = steeringAngle;

    state.steering_rate_deg_per_sec =
        randomBetween(1, 5) *
        Math.sign(steeringAngle || 1);

    state.longitudinal_acceleration_mps2 =
        acceleration;

    state.lateral_acceleration_mps2 =
        lateralAcceleration;

    state.vertical_acceleration_mps2 =
        verticalAcceleration;

    state.yaw_rate_deg_per_sec = yawRate;

    state.abs_active =
        brake > 85 && state.speed_kmh > 25;

    state.traction_control_active =
        acceleration > 3 && state.speed_kmh > 15;

    state.heading_deg =
        (state.heading_deg + yawRate * deltaSeconds + 360) %
        360;

    const distanceKm =
        state.speed_kmh * (deltaSeconds / 3600);

    updateLocation(state, distanceKm);
}

function updateDriverMonitoring(state, scenario) {
    const monitoring = state.driver_monitoring;

    monitoring.eyes_closed = false;
    monitoring.phone_detected = false;

    monitoring.blink_duration_ms = randomInt(100, 250);

    monitoring.head_pose_yaw_deg =
        randomBetween(-8, 8);

    monitoring.head_pose_pitch_deg =
        randomBetween(-5, 8);

    monitoring.face_visibility_pct =
        randomInt(92, 100);

    if (scenario === "distracted") {
        monitoring.phone_detected =
            Math.random() < 0.7;

        monitoring.head_pose_yaw_deg =
            randomBetween(-35, 35);

        monitoring.head_pose_pitch_deg =
            randomBetween(15, 30);

        monitoring.face_visibility_pct =
            randomInt(65, 95);
    }

    if (scenario === "drowsy") {
        monitoring.eyes_closed =
            Math.random() < 0.5;

        monitoring.blink_duration_ms =
            randomInt(500, 1200);

        monitoring.head_pose_pitch_deg =
            randomBetween(15, 30);
    }

    if (Math.random() < 0.01) {
        monitoring.face_visibility_pct =
            randomInt(10, 50);
    }

    if (Math.random() < 0.005) {
        state.seatbelt_fastened = false;
    } else if (Math.random() < 0.1) {
        state.seatbelt_fastened = true;
    }
}

function generateDriverTelemetry(assetId) {
    const state = vehicleStates.get(assetId);

    const now = Date.now();

    const deltaSeconds = clamp(
        (now - state.previous_timestamp) / 1000,
        0,
        30
    );

    state.previous_timestamp = now;

    const scenario = selectDrivingScenario(state);

    updateDrivingBehavior(
        state,
        scenario,
        deltaSeconds
    );

    updateDriverMonitoring(state, scenario);

    return {
        schema_version: "1.0",
        event_type: "driver_telemetry",

        asset_id: state.asset_id,
        asset_type: vehicleConfig.asset_type,
        device_id: state.device_id,

        driver_id: state.driver_id,
        trip_id: state.trip_id,

        timestamp: new Date(now).toISOString(),

        speed_kmh: round(state.speed_kmh),

        accelerator_position_pct: round(
            state.accelerator_position_pct
        ),

        brake_pedal_position_pct: round(
            state.brake_pedal_position_pct
        ),

        brake_pressure_bar: round(
            state.brake_pressure_bar
        ),

        steering_angle_deg: round(
            state.steering_angle_deg
        ),

        steering_rate_deg_per_sec: round(
            state.steering_rate_deg_per_sec
        ),

        longitudinal_acceleration_mps2: round(
            state.longitudinal_acceleration_mps2
        ),

        lateral_acceleration_mps2: round(
            state.lateral_acceleration_mps2
        ),

        vertical_acceleration_mps2: round(
            state.vertical_acceleration_mps2
        ),

        yaw_rate_deg_per_sec: round(
            state.yaw_rate_deg_per_sec
        ),

        abs_active: state.abs_active,
        traction_control_active: state.traction_control_active,
        seatbelt_fastened: state.seatbelt_fastened,

        driver_monitoring: {
            eyes_closed: state.driver_monitoring.eyes_closed,

            blink_duration_ms:
                state.driver_monitoring.blink_duration_ms,

            head_pose_yaw_deg: round(
                state.driver_monitoring.head_pose_yaw_deg
            ),

            head_pose_pitch_deg: round(
                state.driver_monitoring.head_pose_pitch_deg
            ),

            phone_detected:
                state.driver_monitoring.phone_detected,

            face_visibility_pct:
                state.driver_monitoring.face_visibility_pct,
        },

        location: {
            latitude: round(state.latitude, 6),
            longitude: round(state.longitude, 6),
        },
    };
}

async function simulateDriverData() {
    for (const driver of drivers) {
        try {
            const data = generateDriverTelemetry(
                driver.asset_id
            );

            await publishKafka(JSON.stringify(data), data.asset_id);

            console.info(
                `[DRIVER TELEMETRY] ${data.asset_id}`,
                data
            );
        } catch (error) {
            console.error(
                `[DRIVER SIMULATOR ERROR] ${driver.asset_id}`,
                error
            );
        }
    }
}

export const driverDataSimulator = () => {
    initializeDrivers();
    console.info("Driver Behavior and Safety simulator started");
    setInterval(() => {
        simulateDriverData();
    }, INTERVAL_MS);
}