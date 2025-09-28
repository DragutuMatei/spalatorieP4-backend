import express from "express";
import { saveSettingsController, getSettingsController } from "../controllers/settingsController.js";

const settingsRouter = express.Router();

settingsRouter.post("/settings", saveSettingsController);
settingsRouter.get("/settings", getSettingsController);

export default settingsRouter;


