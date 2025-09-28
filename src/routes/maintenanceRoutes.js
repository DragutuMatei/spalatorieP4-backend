import express from "express";
import {
  addMaintenanceIntervalController,
  getAllMaintenanceIntervalsController,
  deleteMaintenanceIntervalController,
  deleteConflictingBookingsController,
} from "../controllers/maintenanceController.js";

const maintenanceRoutes = express.Router();

maintenanceRoutes.post("/maintenance", addMaintenanceIntervalController);
maintenanceRoutes.get("/maintenance", getAllMaintenanceIntervalsController);
maintenanceRoutes.delete("/maintenance/:maintenanceId", deleteMaintenanceIntervalController);
maintenanceRoutes.post("/maintenance/delete-conflicts", deleteConflictingBookingsController);

export default maintenanceRoutes;
