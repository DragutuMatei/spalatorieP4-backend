import { getSettings, saveSetting } from "../services/settings.js";
import { getIO } from "../utils/socket.js";

const saveSettingsController = async (req, res) => {
  const { key, value } = req.body;
  const result = await saveSetting(key, value);
  const code = result.code;
  delete result.code;
  console.log(result);
  if (code === 200) {
    // Emit toate setările pentru live update
    console.log("Emitting socket settings update:", result.settings);
    const socketData = {
      action: "update",
      settings: result,
    };
    console.log("Socket data being emitted:", socketData);
    getIO().emit("settings", socketData);
    console.log("Socket emission completed");
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

const getSettingsController = async (req, res) => {
  const result = await getSettings();
  const code = result.code;
  delete result.code;
  console.log(result);
  if (code === 200) {
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export { saveSettingsController, getSettingsController };
