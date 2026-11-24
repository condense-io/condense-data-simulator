import { publishKafka } from "./publishToKafka.js";

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 2000);
const EARTH_RADIUS_M = 6_371_000;

const vehicles = [
    {
        asset_id: "EV_041",
        device_id: "BMS_041",
        latitude: 12.9716,
        longitude: 77.5946,
        initial_soc: 82,
        initial_odometer: 32450.2,
        initial_soh: 96,
        is_charging: false,
    },
    {
        asset_id: "EV_042",
        device_id: "BMS_042",
        latitude: 12.9352,
        longitude: 77.6245,
        initial_soc: 68,
        initial_odometer: 45280.5,
        initial_soh: 91,
        is_charging: false,
    },
    {
        asset_id: "EV_043",
        device_id: "BMS_043",
        latitude: 12.9981,
        longitude: 77.5502,
        initial_soc: 35,
        initial_odometer: 18520.8,
        initial_soh: 94,
        is_charging: true,
    },
    {
        asset_id: "EV_044",
        device_id: "BMS_044",
        latitude: 12.9616,
        longitude: 77.6387,
        initial_soc: 24,
        initial_odometer: 52100.4,
        initial_soh: 89,
        is_charging: false,
    },
    {
        asset_id: "EV_045",
        device_id: "BMS_045",
        latitude: 13.0358,
        longitude: 77.5970,
        initial_soc: 55,
        initial_odometer: 27890.1,
        initial_soh: 97,
        is_charging: false,
    },
];

const vehicleConfig = {
    asset_type: "electric_car",
    make_model: "Tata Nexon EV",

    battery_capacity_kwh: 40.5,
    battery_voltage_nominal: 342.6,

    charging_station_ids: [
        "CHARGER_001",
        "CHARGER_002",
        "CHARGER_003",
    ],

    max_charging_power_kw: 30,
    max_driving_speed_kmh: 100,
    max_soc: 95,
    min_soc: 10,
};

const vehicleStates = new Map();

const randomBetween = (min, max) =>
    Math.random() * (max - min) + min;

const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

const round = (value, decimals = 2) =>
    Number(value.toFixed(decimals));

const randomItem = (items) =>
    items[Math.floor(Math.random() * items.length)];

function initializeVehicles() {
    for (const vehicle of vehicles) {
        const initialSOC = vehicle.initial_soc;

        vehicleStates.set(vehicle.asset_id, {
            asset_id: vehicle.asset_id,
            device_id: vehicle.device_id,

            latitude: vehicle.latitude,
            longitude: vehicle.longitude,

            odometer_km: vehicle.initial_odometer,

            battery: {
                capacity_kwh: vehicleConfig.battery_capacity_kwh,
                voltage: vehicleConfig.battery_voltage_nominal,
                current_amp: 0,

                soc: initialSOC,
                soh: vehicle.initial_soh,

                temp_min: 34,
                temp_max: 40,
                temp_avg: 37,

                cell_voltage_min: 3.42,
                cell_voltage_max: 3.68,

                cell_temp_min: 34,
                cell_temp_max: 40,

                cycle_count: 486,
                cycle_progress: 0,

                energy_charged_kwh: 1250.5,
                energy_discharged_kwh: 1182.3,
            },

            charging: {
                is_charging: vehicle.is_charging,
                station_id: vehicle.is_charging
                    ? "CHARGER_001"
                    : null,
            },

            energy: {
                regen_energy_kwh: 2.4,
            },

            cooling: {
                inlet_temp: 28.5,
                outlet_temp: 33.2,
            },

            speed_kmh: 0,
            heading_deg: randomBetween(0, 360),

            previous_timestamp: Date.now(),
        });
    }
}

function updateLocation(state, distanceKm) {
    const headingRad = (state.heading_deg * Math.PI) / 180;
    const distanceM = distanceKm * 1000;

    const latitudeRad = (state.latitude * Math.PI) / 180;

    const deltaLatitude =
        (distanceM * Math.cos(headingRad)) / EARTH_RADIUS_M;

    const deltaLongitude =
        (distanceM * Math.sin(headingRad)) /
        (EARTH_RADIUS_M * Math.cos(latitudeRad));

    state.latitude += (deltaLatitude * 180) / Math.PI;
    state.longitude += (deltaLongitude * 180) / Math.PI;
}

function updateChargingState(state) {
    const charging = state.charging;
    const soc = state.battery.soc;

    if (charging.is_charging) {
        if (soc >= vehicleConfig.max_soc) {
            charging.is_charging = false;
            charging.station_id = null;
        }

        return;
    }

    if (soc <= vehicleConfig.min_soc) {
        charging.is_charging = true;
        charging.station_id = randomItem(
            vehicleConfig.charging_station_ids
        );
    }
}

function updateBatteryTemperature(state, powerKw, isCharging) {
    const battery = state.battery;

    const targetTemp = isCharging
        ? 38 + powerKw * 0.12
        : 34 + powerKw * 0.08;

    battery.temp_avg +=
        (targetTemp - battery.temp_avg) * 0.08;

    battery.temp_avg += randomBetween(-0.15, 0.15);

    battery.temp_avg = clamp(battery.temp_avg, 20, 60);

    battery.temp_min = battery.temp_avg - randomBetween(1, 3);
    battery.temp_max = battery.temp_avg + randomBetween(1, 4);

    battery.cell_temp_min = battery.temp_min;
    battery.cell_temp_max = battery.temp_max;

    state.cooling.inlet_temp +=
        (battery.temp_avg - 10 - state.cooling.inlet_temp) * 0.05;

    state.cooling.outlet_temp +=
        (battery.temp_avg - state.cooling.outlet_temp) * 0.05;
}

function updateBatteryVoltage(state) {
    const battery = state.battery;

    const socVoltage =
        310 + (battery.soc / 100) * 65;

    battery.voltage = clamp(
        socVoltage + randomBetween(-2, 2),
        300,
        400
    );

    const cellBaseVoltage = battery.voltage / 96;

    battery.cell_voltage_min = round(
        cellBaseVoltage - randomBetween(0.01, 0.04),
        3
    );

    battery.cell_voltage_max = round(
        cellBaseVoltage + randomBetween(0.01, 0.04),
        3
    );
}

function updateBatteryHealth(state, energyThroughputKwh) {
    const battery = state.battery;

    const throughputForOneCycle =
        battery.capacity_kwh * 2;

    battery.cycle_progress +=
        energyThroughputKwh / throughputForOneCycle;

    while (battery.cycle_progress >= 1) {
        battery.cycle_count += 1;
        battery.cycle_progress -= 1;

        battery.soh = clamp(
            battery.soh - 0.002,
            70,
            100
        );
    }
}

function generateEVTelemetry(assetId) {
    const state = vehicleStates.get(assetId);

    const now = Date.now();
    const deltaHours =
        Math.max(0, now - state.previous_timestamp) / 3_600_000;

    state.previous_timestamp = now;

    const battery = state.battery;
    const charging = state.charging;

    updateChargingState(state);

    let batteryPowerKw = 0;
    let chargingPowerKw = 0;
    let chargingVoltage = 0;
    let chargingCurrentAmp = 0;

    let dischargedEnergy = 0;
    let chargedEnergy = 0;
    let regenEnergy = 0;

    if (charging.is_charging) {
        chargingPowerKw = randomBetween(6.5, 7.2);

        if (Math.random() < 0.15) {
            chargingPowerKw = randomBetween(15, 30);
        }

        chargingPowerKw = Math.min(
            chargingPowerKw,
            vehicleConfig.max_charging_power_kw
        );

        chargedEnergy = chargingPowerKw * deltaHours;

        battery.soc = clamp(
            battery.soc +
            (chargedEnergy / battery.capacity_kwh) * 100,
            0,
            100
        );

        battery.energy_charged_kwh += chargedEnergy;

        chargingVoltage = battery.voltage + randomBetween(10, 35);
        chargingCurrentAmp =
            (chargingPowerKw * 1000) / chargingVoltage;

        battery.current_amp =
            -(chargedEnergy > 0
                ? (chargingPowerKw * 1000) / battery.voltage
                : 0);

        batteryPowerKw = chargingPowerKw;

    } else {
        state.speed_kmh = clamp(
            state.speed_kmh + randomBetween(-8, 8),
            0,
            vehicleConfig.max_driving_speed_kmh
        );

        if (Math.random() < 0.08) {
            state.speed_kmh = 0;
        }

        state.heading_deg =
            (state.heading_deg + randomBetween(-10, 10) + 360) % 360;

        const distanceKm =
            state.speed_kmh * deltaHours;

        state.odometer_km += distanceKm;
        updateLocation(state, distanceKm);

        const tractionPowerKw =
            state.speed_kmh === 0
                ? randomBetween(0.3, 0.8)
                : 3 + state.speed_kmh * 0.13 +
                randomBetween(0, 2);

        dischargedEnergy = tractionPowerKw * deltaHours;

        if (state.speed_kmh > 15 && Math.random() < 0.25) {
            regenEnergy =
                dischargedEnergy * randomBetween(0.05, 0.2);
        }

        const netEnergy =
            Math.max(0, dischargedEnergy - regenEnergy);

        battery.soc = clamp(
            battery.soc -
            (netEnergy / battery.capacity_kwh) * 100,
            0,
            100
        );

        battery.energy_discharged_kwh += dischargedEnergy;
        state.energy.regen_energy_kwh += regenEnergy;

        battery.current_amp =
            (tractionPowerKw * 1000) / battery.voltage;

        batteryPowerKw = tractionPowerKw;
    }

    updateBatteryHealth(
        state,
        chargedEnergy + dischargedEnergy
    );

    updateBatteryTemperature(
        state,
        batteryPowerKw,
        charging.is_charging
    );

    updateBatteryVoltage(state);

    if (charging.is_charging) {
        battery.current_amp =
            -(chargingPowerKw * 1000) / battery.voltage;
    } else {
        battery.current_amp =
            (batteryPowerKw * 1000) / battery.voltage;
    }

    return {
        schema_version: "1.0",
        event_type: "ev_battery_telemetry",

        asset_id: state.asset_id,
        asset_type: vehicleConfig.asset_type,
        device_id: state.device_id,

        timestamp: new Date(now).toISOString(),
        make_model: vehicleConfig.make_model,
        odometer_km: round(state.odometer_km),

        battery: {
            battery_voltage: round(battery.voltage),
            battery_current_amp: round(battery.current_amp),
            battery_capacity_kwh: battery.capacity_kwh,

            state_of_charge_pct: round(battery.soc),
            state_of_health_pct: round(battery.soh),

            battery_temp_min_c: round(battery.temp_min),
            battery_temp_max_c: round(battery.temp_max),
            battery_temp_avg_c: round(battery.temp_avg),

            cell_voltage_min: round(battery.cell_voltage_min, 3),
            cell_voltage_max: round(battery.cell_voltage_max, 3),

            cell_temp_min_c: round(battery.cell_temp_min),
            cell_temp_max_c: round(battery.cell_temp_max),

            battery_cycle_count: battery.cycle_count,

            energy_charged_kwh: round(battery.energy_charged_kwh),
            energy_discharged_kwh: round(battery.energy_discharged_kwh),
        },

        charging: {
            is_charging: charging.is_charging,
            charging_station_id: charging.is_charging
                ? charging.station_id
                : null,

            charging_power_kw: round(chargingPowerKw),
            charging_voltage: round(chargingVoltage),
            charging_current_amp: round(chargingCurrentAmp),

            charging_connector_status: charging.is_charging
                ? "charging"
                : "disconnected",
        },

        energy: {
            regen_energy_kwh: round(state.energy.regen_energy_kwh),
        },

        cooling: {
            battery_coolant_inlet_temp_c: round(
                state.cooling.inlet_temp
            ),
            battery_coolant_outlet_temp_c: round(
                state.cooling.outlet_temp
            ),
        },

        location: {
            latitude: round(state.latitude, 6),
            longitude: round(state.longitude, 6),
        },
    };
}

async function simulateEVData() {
    for (const vehicle of vehicles) {
        try {
            const data = generateEVTelemetry(vehicle.asset_id);

            await publishKafka(data, data.asset_id);

            console.info(
                `[EV TELEMETRY] ${data.asset_id}`,
                data
            );
        } catch (error) {
            console.error(
                `[EV SIMULATOR ERROR] ${vehicle.asset_id}`,
                error
            );
        }
    }
}

export const evBatteryDataSimulator = () => {
    initializeVehicles();

    console.info("EV battery telemetry simulator started");

    setInterval(async () => {
        simulateEVData();
    }, INTERVAL_MS);
}