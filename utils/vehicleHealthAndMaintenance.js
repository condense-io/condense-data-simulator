import { publishKafka } from "./publishToKafka.js"
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

// DTC Errors for Vehicles

const vehicleProfiles = {
    TRUCK_001: {},
    TRUCK_002: { coolantLeak: true },
    TRUCK_003: { engineOverheating: true },
    TRUCK_004: { lowOilPressure: true },
    TRUCK_005: { electricalFault: true }
}

const healthConfig = {
    assetType: "heavy_vehicle",
    makeModel: "Tata Signa 4825",
    initialValues: {
        odometer_km: 185420.5,
        engine: {
            engine_rpm: 1850,
            engine_load_pct: 55,
            engine_temp_c: 92,
            coolant_temp_c: 88,
            oil_pressure_psi: 42,
            oil_temp_c: 95,
            oil_level_pct: 95
        },
        cooling: {
            coolant_level_pct: 95
        },
        intake: {
            intake_air_temp_c: 32,
            intake_manifold_pressure_kpa: 145
        },
        electrical: {
            battery_voltage: 13.8,
            alternator_voltage: 14.2
        },
        transmission: {
            transmission_temp_c: 82
        },
        brakes: {
            brake_temp_front_c: 85,
            brake_temp_rear_c: 75,
            brake_pad_wear_front_pct: 25,
            brake_pad_wear_rear_pct: 20
        },
        tyres: {
            front_left_psi: 100,
            front_right_psi: 99,
            rear_left_psi: 102,
            rear_right_psi: 101
        },
        vibration: {
            x: 1.8,
            y: 2.1,
            z: 3.2
        }
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

        const initialValues = structuredClone(
            healthConfig.initialValues
        );

        vehicleStates.set(vehicleId, {
            ...initialValues,

            previousTimestamp: Date.now(),

            faultProfile: vehicleProfiles[vehicleId] || {},

            simulatedSpeedKmh: randomBetween(35, 70)
        });

    });
};

const generateDiagnosticCodes = (state) => {

    const codes = [];

    const engine = state.engine;
    const electrical = state.electrical;
    const intake = state.intake;
    if (
        engine.engine_temp_c >= 110 ||
        engine.coolant_temp_c >= 105
    ) {
        codes.push("P0217");
    }

    if (engine.oil_pressure_psi < 20) {
        codes.push("P0524");
    }

    if (electrical.battery_voltage < 11.8) {
        codes.push("P0562");
    }

    if (
        engine.engine_load_pct > 60 &&
        intake.intake_manifold_pressure_kpa < 80
    ) {
        codes.push("P0299");
    }

    return [...new Set(codes)];
};

const generateVehicleHealth = (vehicleId) => {

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

    const distance =
        state.simulatedSpeedKmh * deltaHours;

    const profile = state.faultProfile;

    // Work on a copy of the previous state
    const nextState = structuredClone(state);

    nextState.previousTimestamp = now;

    const engine = nextState.engine;

    engine.engine_rpm = clamp(
        engine.engine_rpm + randomBetween(-50, 50),
        700,
        2800
    );

    engine.engine_load_pct = clamp(
        engine.engine_load_pct + randomBetween(-5, 5),
        10,
        100
    );

    const loadEffect =
        (engine.engine_load_pct - 50) * 0.015;

    const overheatingEffect =
        profile.engineOverheating ? 0.35 : 0;

    engine.engine_temp_c = clamp(
        engine.engine_temp_c +
        randomBetween(-0.2, 0.2) +
        loadEffect +
        overheatingEffect,
        70,
        125
    );

    engine.coolant_temp_c +=
        (engine.engine_temp_c - 8 - engine.coolant_temp_c) * 0.08 +
        randomBetween(-0.15, 0.15);

    engine.coolant_temp_c = clamp(
        engine.coolant_temp_c,
        65,
        115
    );

    const oilPressureLoss =
        profile.lowOilPressure ? 0.3 : 0;

    engine.oil_pressure_psi = clamp(
        engine.oil_pressure_psi +
        randomBetween(-0.4, 0.4) -
        oilPressureLoss,
        5,
        60
    );

    engine.oil_temp_c = clamp(
        engine.oil_temp_c +
        (engine.engine_temp_c - 10 - engine.oil_temp_c) * 0.04 +
        randomBetween(-0.2, 0.2),
        60,
        140
    );

    engine.oil_level_pct = clamp(
        engine.oil_level_pct - distance * 0.0005,
        0,
        100
    );

    const cooling = nextState.cooling;

    const coolantLoss =
        profile.coolantLeak ? 0.025 : 0.0002;

    cooling.coolant_level_pct = clamp(
        cooling.coolant_level_pct -
        coolantLoss -
        randomBetween(0, 0.005),
        0,
        100
    );

    const intake = nextState.intake;

    intake.intake_air_temp_c = clamp(
        intake.intake_air_temp_c +
        randomBetween(-0.5, 0.5),
        20,
        85
    );

    intake.intake_manifold_pressure_kpa = clamp(
        100 + engine.engine_load_pct * 0.85 +
        randomBetween(-5, 5),
        80,
        220
    );

    const electrical = nextState.electrical;

    const electricalLoss =
        profile.electricalFault ? 0.025 : 0;

    electrical.battery_voltage = clamp(
        electrical.battery_voltage +
        randomBetween(-0.05, 0.05) -
        electricalLoss,
        9,
        15
    );

    electrical.alternator_voltage = clamp(
        electrical.alternator_voltage +
        randomBetween(-0.04, 0.04) -
        (profile.electricalFault ? 0.025 : 0),
        9,
        15
    );

    const transmission = nextState.transmission;

    transmission.transmission_temp_c = clamp(
        transmission.transmission_temp_c +
        (engine.engine_load_pct - 50) * 0.015 +
        randomBetween(-0.3, 0.3),
        50,
        130
    );

    const brakes = nextState.brakes;

    const brakingEvent = Math.random() < 0.15;

    brakes.brake_temp_front_c = clamp(
        brakes.brake_temp_front_c +
        (brakingEvent ? randomBetween(5, 15) : 0) -
        randomBetween(0.5, 2),
        30,
        350
    );

    brakes.brake_temp_rear_c = clamp(
        brakes.brake_temp_rear_c +
        (brakingEvent ? randomBetween(3, 10) : 0) -
        randomBetween(0.5, 2),
        30,
        300
    );

    const wearIncrement =
        distance * 0.0002 +
        (brakingEvent ? 0.001 : 0);

    brakes.brake_pad_wear_front_pct = clamp(
        brakes.brake_pad_wear_front_pct + wearIncrement,
        0,
        100
    );

    brakes.brake_pad_wear_rear_pct = clamp(
        brakes.brake_pad_wear_rear_pct + wearIncrement * 0.8,
        0,
        100
    );

    const tyres = nextState.tyres;

    const tyreLeak = profile.tyreLeak ? 0.02 : 0;

    for (const tyre of Object.keys(tyres)) {

        tyres[tyre] = clamp(
            tyres[tyre] +
            randomBetween(-0.12, 0.12) -
            tyreLeak,
            50,
            120
        );

    }

    const vibration = nextState.vibration;

    const engineWear =
        (100 - engine.oil_level_pct) * 0.02;

    vibration.x = clamp(
        vibration.x +
        randomBetween(-0.15, 0.15) +
        engineWear * 0.01,
        0,
        20
    );

    vibration.y = clamp(
        vibration.y +
        randomBetween(-0.15, 0.15) +
        engineWear * 0.01,
        0,
        20
    );

    vibration.z = clamp(
        vibration.z +
        randomBetween(-0.2, 0.2) +
        engineWear * 0.02,
        0,
        25
    );

    nextState.odometer_km += distance;

    const diagnosticCodes =
        generateDiagnosticCodes(nextState);

    vehicleStates.set(vehicleId, nextState);

    return {
        schema_version: "1.0",
        event_type: "vehicle_health",
        asset_id: vehicleId,
        asset_type: healthConfig.assetType,
        device_id: deviceIds[index],
        timestamp: new Date(now).toISOString(),
        make_model: healthConfig.makeModel,
        odometer_km: round(nextState.odometer_km, 3),
        engine: {
            engine_rpm: round(engine.engine_rpm),
            engine_load_pct: round(engine.engine_load_pct),
            engine_temp_c: round(engine.engine_temp_c),
            coolant_temp_c: round(engine.coolant_temp_c),
            oil_pressure_psi: round(engine.oil_pressure_psi),
            oil_temp_c: round(engine.oil_temp_c),
            oil_level_pct: round(engine.oil_level_pct)
        },
        cooling: {
            coolant_level_pct: round(
                cooling.coolant_level_pct
            )
        },
        intake: {
            intake_air_temp_c: round(
                intake.intake_air_temp_c
            ),
            intake_manifold_pressure_kpa: round(
                intake.intake_manifold_pressure_kpa
            )
        },
        electrical: {
            battery_voltage: round(
                electrical.battery_voltage
            ),
            alternator_voltage: round(
                electrical.alternator_voltage
            )
        },
        transmission: {
            transmission_temp_c: round(
                transmission.transmission_temp_c
            )
        },
        brakes: {
            brake_temp_front_c: round(
                brakes.brake_temp_front_c
            ),
            brake_temp_rear_c: round(
                brakes.brake_temp_rear_c
            ),
            brake_pad_wear_front_pct: round(
                brakes.brake_pad_wear_front_pct
            ),
            brake_pad_wear_rear_pct: round(
                brakes.brake_pad_wear_rear_pct
            )
        },
        tyres: {
            front_left_psi: round(tyres.front_left_psi),
            front_right_psi: round(tyres.front_right_psi),
            rear_left_psi: round(tyres.rear_left_psi),
            rear_right_psi: round(tyres.rear_right_psi)
        },
        vibration: {
            x: round(vibration.x),
            y: round(vibration.y),
            z: round(vibration.z)
        },
        diagnostic_trouble_codes: diagnosticCodes
    };
};

// Vehicle Health And Maintenance Simulator
export const vehicleHealthSimulator = async () => {
    console.info("Starting Vehicle Health Simulator...");
    initializeVehicles();
    setInterval(async () => {
        for (const vehicleId of assets) {
            try {
                const data = generateVehicleHealth(vehicleId);

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
    }, INTERVAL_MS)
}