import dotenv from "dotenv";
dotenv.config();
import { cncSimulator } from "./utils/cncDataSimulator.js";
import { startTlematicsSimulator } from "./utils/telematicsDataSimulator.js";
import { startWearableSimulator } from "./utils/wearableDataSimulator.js";
import { soilDataSimulatior } from "./utils/soilSensorDataSimulator.js";
import { creditCardDataSimulator } from "./utils/creditCardDataSimulator.js";
import { fleetDataSimulator } from "./utils/fleetTracking.js"
import { vehicleHealthSimulator } from "./utils/vehicleHealthAndMaintenance.js"
import { geofenceDataSimulator } from "./utils/geofenceDataSimulator.js"
import { evBatteryDataSimulator } from "./utils/evDataSimulator.js"
import { driverDataSimulator } from "./utils/driverBehaviorDataSimulator.js";
import { logisticsDataSimulator } from "./utils/logisticsAndLastMileDataSimulator.js"
import "./logger.js";

if (process.env.DATA_SIMULATOR === "true") {
  console.info("Data Simulator is enabled");
  // Add your data simulation code here
  if (
    process.env.INDUSTRIAL_AUTOMATION === "true" ||
    process.env.INDUSTRIAL_DATA_SIMULATOR === "true"
  ) {
    console.info("Industrial Automation is enabled");
    // Add your industrial automation code here
    cncSimulator();
  } else if (
    process.env.TELEMATICS_SIMULATOR === "true" ||
    process.env.TELEMATICS_DATA_SIMULATOR === "true"
  ) {
    console.info("Telemetry Simulation is enabled");
    // Add your telemetry simulation code here
    startTlematicsSimulator();
  } else if (process.env.WEARABLE_SIMULATOR === "true") {
    console.info("Wearable Simulation is enabled");
    // Add your wearable simulation code here
    startWearableSimulator();
  } else if (
    process.env.SOIL_SENSOR_SIMULATOR === "true" ||
    process.env.SOIL_SENSOR_DATA_SIMULATOR === "true"
  ) {
    console.info("Soil Sensor Simulation is enabled");
    // Add your soil sensor simulation code here
    soilDataSimulatior();
  } else if (process.env.CREDIT_CARD_SIMULATOR === "true") {
    console.info("Credit Card Simulation is enabled");
    // Add your credit card simulation code here
    creditCardDataSimulator();
  } else if (process.env.FLEET_TRACKING_AND_MANAGEMENT === "true") {
    fleetDataSimulator();
  } else if (process.env.VEHICLE_HEALTH_AND_PREDICTIVE_MAINTENANCE === "true") {
    vehicleHealthSimulator();
  } else if (process.env.GEOFENCE_EVENTS === "true") {
    geofenceDataSimulator();
  } else if (process.env.EV_BATTERY_DATA_SIMULATOR === "true") {
    evBatteryDataSimulator();
  } else if (process.env.DRIVER_BEHAVIOR_AND_SAFETY_SIMULATOR === "true") {
    driverDataSimulator();
  } else if (process.env.LOGISTICS_DATA_SIMULATOR === "true") {
    logisticsDataSimulator();
  } else {
    startTlematicsSimulator();
  }
} else {
  console.info("Data Simulator is disabled");
}
