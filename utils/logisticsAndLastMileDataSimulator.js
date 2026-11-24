import { publishKafka } from "./publishToKafka.js";

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 2000);
const EARTH_RADIUS_M = 6_371_000;


const vehicles = [
    {
        asset_id: "VAN_021",
        device_id: "TCU_021",
        driver_id: "DRV_407",
        latitude: 12.9716,
        longitude: 77.5946,
    },
    {
        asset_id: "VAN_022",
        device_id: "TCU_022",
        driver_id: "DRV_408",
        latitude: 12.9352,
        longitude: 77.6245,
    },
    {
        asset_id: "VAN_023",
        device_id: "TCU_023",
        driver_id: "DRV_409",
        latitude: 12.9981,
        longitude: 77.5502,
    },
    {
        asset_id: "VAN_024",
        device_id: "TCU_024",
        driver_id: "DRV_410",
        latitude: 12.9616,
        longitude: 77.6387,
    },
    {
        asset_id: "VAN_025",
        device_id: "TCU_025",
        driver_id: "DRV_411",
        latitude: 12.9982,
        longitude: 77.6124,
    },
];

const config = {
    asset_type: "delivery_van",
    make_model: "Tata Ace Gold",

    total_stops: 12,
    distance_per_segment_km: 7.5,

    min_speed_kmh: 15,
    max_speed_kmh: 55,

    min_dwell_ticks: 2,
    max_dwell_ticks: 4,

    delivery_priorities: [
        "standard",
        "standard",
        "express",
        "urgent",
    ],
};

const vehicleStates = new Map();

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

function destinationPoint(
    latitude,
    longitude,
    distanceKm,
    headingDeg
) {
    const headingRad = headingDeg * Math.PI / 180;
    const distanceM = distanceKm * 1000;

    const latRad = latitude * Math.PI / 180;
    const lonRad = longitude * Math.PI / 180;

    const angularDistance = distanceM / EARTH_RADIUS_M;

    const destinationLat = Math.asin(
        Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) *
        Math.cos(headingRad)
    );

    const destinationLon = lonRad + Math.atan2(
        Math.sin(headingRad) * Math.sin(angularDistance) *
        Math.cos(latRad),
        Math.cos(angularDistance) -
        Math.sin(latRad) * Math.sin(destinationLat)
    );

    return {
        latitude: destinationLat * 180 / Math.PI,
        longitude: destinationLon * 180 / Math.PI,
    };
}

function calculateDistance(pointA, pointB) {
    const toRadians = (value) =>
        value * Math.PI / 180;

    const lat1 = toRadians(pointA.latitude);
    const lat2 = toRadians(pointB.latitude);

    const deltaLat = toRadians(
        pointB.latitude - pointA.latitude
    );

    const deltaLon = toRadians(
        pointB.longitude - pointA.longitude
    );

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) ** 2;

    return 2 * EARTH_RADIUS_M *
        Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) / 1000;
}

function calculateHeading(pointA, pointB) {
    const lat1 = pointA.latitude * Math.PI / 180;
    const lat2 = pointB.latitude * Math.PI / 180;

    const deltaLon =
        (pointB.longitude - pointA.longitude) * Math.PI / 180;

    const y = Math.sin(deltaLon) * Math.cos(lat2);

    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    return (
        (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
    );
}

function buildRoute(startLocation) {
    const route = [{
        latitude: startLocation.latitude,
        longitude: startLocation.longitude,
    }];

    let currentPoint = { ...startLocation };
    let heading = randomBetween(0, 360);

    for (let index = 1; index < config.total_stops; index++) {
        // Change direction gradually to simulate a winding route.
        heading = (heading + randomBetween(-65, 65) + 360) % 360;

        currentPoint = destinationPoint(
            currentPoint.latitude,
            currentPoint.longitude,
            config.distance_per_segment_km,
            heading
        );

        route.push(currentPoint);
    }

    return route;
}

function calculateRouteDistance(route) {
    let totalDistance = 0;

    for (let index = 1; index < route.length; index++) {
        totalDistance += calculateDistance(
            route[index - 1],
            route[index]
        );
    }

    return totalDistance;
}

function createDeliveryJob(vehicle, index) {
    const now = Date.now();

    const packageCount = randomInt(8, 25);
    const route = buildRoute(vehicle);

    const plannedDistance = calculateRouteDistance(route);

    const plannedDurationMin = Math.ceil(
        (plannedDistance / 35) * 60 + config.total_stops * 5
    );

    const scheduledDeliveryTime =
        now + plannedDurationMin * 60_000;

    const deliveryWindowStart =
        scheduledDeliveryTime - 15 * 60_000;

    const deliveryWindowEnd =
        scheduledDeliveryTime + 30 * 60_000;

    return {
        delivery_job_id: `JOB_${9920 + index}`,
        route_id: `ROUTE_${102 + index}`,
        shipment_id: `SHIP_${55020 + index}`,

        shipment: {
            package_count: packageCount,
            total_weight_kg: round(randomBetween(80, 450)),
            package_volume_m3: round(randomBetween(1.2, 6.5)),
            delivery_priority: randomItem(
                config.delivery_priorities
            ),
        },

        route: {
            points: route,
            segment_distances: route.slice(1).map((point, i) =>
                calculateDistance(route[i], point)
            ),

            planned_route_distance_km: round(plannedDistance),
            planned_route_duration_min: plannedDurationMin,

            current_stop_sequence: 1,
            total_stops: config.total_stops,

            scheduled_delivery_time:
                new Date(scheduledDeliveryTime).toISOString(),

            delivery_window_start:
                new Date(deliveryWindowStart).toISOString(),

            delivery_window_end:
                new Date(deliveryWindowEnd).toISOString(),
        },

        route_progress_km: 0,
        stop_dwell_ticks: 0,
        completed_stops: 0,
        completed_packages: 0,

        job_start_timestamp: now,
        job_completed: false,
    };
}

function initializeVehicles() {
    vehicles.forEach((vehicle, index) => {
        const job = createDeliveryJob(vehicle, index);

        vehicleStates.set(vehicle.asset_id, {
            ...vehicle,

            heading_deg: calculateHeading(
                job.route.points[0],
                job.route.points[1]
            ),

            speed_kmh: 0,
            odometer_km: randomBetween(25000, 65000),
            ignition_on: true,

            job,

            previous_timestamp: Date.now(),
        });
    });
}

function interpolateLocation(start, end, progress) {
    return {
        latitude:
            start.latitude +
            (end.latitude - start.latitude) * progress,

        longitude:
            start.longitude +
            (end.longitude - start.longitude) * progress,
    };
}

function updateVehicleMovement(state, deltaHours) {
    const job = state.job;
    const route = job.route;

    if (job.job_completed) {
        state.speed_kmh = 0;
        state.ignition_on = false;
        return;
    }

    // Simulate delivery handling at each stop.
    if (job.stop_dwell_ticks > 0) {
        job.stop_dwell_ticks -= 1;
        state.speed_kmh = 0;
        state.ignition_on = true;
        return;
    }

    const stopIndex = route.current_stop_sequence - 1;

    if (stopIndex >= route.points.length - 1) {
        job.job_completed = true;
        state.speed_kmh = 0;
        state.ignition_on = false;
        return;
    }

    const start = route.points[stopIndex];
    const destination = route.points[stopIndex + 1];

    const segmentDistance =
        route.segment_distances[stopIndex];

    const travelledOnSegment =
        job.route_progress_km -
        route.segment_distances
            .slice(0, stopIndex)
            .reduce((sum, distance) => sum + distance, 0);

    const remainingDistance = Math.max(
        0,
        segmentDistance - travelledOnSegment
    );

    state.speed_kmh = randomBetween(
        config.min_speed_kmh,
        config.max_speed_kmh
    );

    // Occasionally simulate traffic congestion.
    if (Math.random() < 0.15) {
        state.speed_kmh = randomBetween(0, 12);
    }

    const distanceTravelled =
        state.speed_kmh * deltaHours;

    if (distanceTravelled >= remainingDistance) {
        job.route_progress_km += remainingDistance;

        state.latitude = destination.latitude;
        state.longitude = destination.longitude;

        state.heading_deg = calculateHeading(
            start,
            destination
        );

        job.completed_stops += 1;
        job.completed_packages += randomInt(1, 3);

        job.stop_dwell_ticks = randomInt(
            config.min_dwell_ticks,
            config.max_dwell_ticks
        );

        if (route.current_stop_sequence >= route.total_stops) {
            job.job_completed = true;
            state.speed_kmh = 0;
            state.ignition_on = false;
        } else {
            route.current_stop_sequence += 1;
        }

        return;
    }

    job.route_progress_km += distanceTravelled;

    const progress =
        (travelledOnSegment + distanceTravelled) /
        segmentDistance;

    const location = interpolateLocation(
        start,
        destination,
        clamp(progress, 0, 1)
    );

    state.latitude = location.latitude;
    state.longitude = location.longitude;

    state.heading_deg = calculateHeading(
        start,
        destination
    );
}

function generateDeliveryTelemetry(assetId) {
    const state = vehicleStates.get(assetId);

    const now = Date.now();

    const deltaHours = clamp(
        (now - state.previous_timestamp) / 3_600_000,
        0,
        0.01
    );

    state.previous_timestamp = now;

    const job = state.job;

    updateVehicleMovement(state, deltaHours);

    // Odometer advances with route progress.
    const previousOdometer =
        state.last_route_progress_km ?? 0;

    const progressDifference = Math.max(
        0,
        job.route_progress_km - previousOdometer
    );

    state.odometer_km += progressDifference;
    state.last_route_progress_km = job.route_progress_km;

    return {
        schema_version: "1.0",
        event_type: "delivery_telemetry",

        asset_id: state.asset_id,
        asset_type: "delivery_van",
        device_id: state.device_id,
        driver_id: state.driver_id,

        timestamp: new Date(now).toISOString(),

        delivery_job_id: job.delivery_job_id,
        route_id: job.route_id,
        shipment_id: job.shipment_id,

        shipment: {
            ...job.shipment,
        },

        route: {
            planned_route_distance_km:
                job.route.planned_route_distance_km,

            planned_route_duration_min:
                job.route.planned_route_duration_min,

            current_stop_sequence:
                job.route.current_stop_sequence,

            total_stops: job.route.total_stops,

            scheduled_delivery_time:
                job.route.scheduled_delivery_time,

            delivery_window_start:
                job.route.delivery_window_start,

            delivery_window_end:
                job.route.delivery_window_end,
        },

        vehicle: {
            speed_kmh: round(state.speed_kmh),
            odometer_km: round(state.odometer_km),
            ignition_on: state.ignition_on,
        },

        location: {
            latitude: round(state.latitude, 6),
            longitude: round(state.longitude, 6),
            heading_deg: round(state.heading_deg),
        },
    };
}

async function simulateDeliveryData() {
    for (const vehicle of vehicles) {
        try {
            const data = generateDeliveryTelemetry(
                vehicle.asset_id
            );

            await publishKafka(data, data.asset_id);

            const state = vehicleStates.get(vehicle.asset_id);

            console.info(
                `[DELIVERY TELEMETRY] ${data.asset_id}`,
                data
            );
        } catch (error) {
            console.error(
                `[DELIVERY SIMULATOR ERROR] ${vehicle.asset_id}`,
                error
            );
        }
    }
}

export const logisticsDataSimulator = () => {
    initializeVehicles();
    console.info("Delivery telemetry simulator started");

    setInterval(() => {
        simulateDeliveryData();
    }, INTERVAL_MS)
}