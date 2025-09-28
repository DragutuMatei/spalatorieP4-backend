import { db } from "../utils/admin_fire.js";

const saveSetting = async (key, value) => {
  try {
    console.log(`Saving setting: ${key} = ${value}`);
    const settingsRef = db.collection("settings").doc("availability");
    await settingsRef.set({ [key]: value }, { merge: true });
    const saveDoc = await settingsRef.get();
    const settingsData = saveDoc.data();
    
    console.log('Settings after save:', settingsData);

    return {
      code: 200,
      success: true,
      message: "Settings saved!",
      settings: settingsData,
    };
  } catch (error) {
    console.log('Error saving settings:', error);
    return {
      code: 500,
      success: false,
      message: "Settings not saved!",
      error: error,
    };
  }
};

const getSettings = async () => {
  try {
    const settingsRef = db.collection("settings").doc("availability");
    const settings = await settingsRef.get();
    if (!settings.exists) {
      // Creez setările default dacă nu există
      const defaultSettings = {
        dryerEnabled: true,
        m1Enabled: true,
        m2Enabled: true
      };
      await settingsRef.set(defaultSettings);
      return {
        code: 200,
        success: true,
        message: "Default settings created!",
        settings: { uid: settings.id, ...defaultSettings },
      };
    }
    return {
      code: 200,
      success: true,
      message: "Settings retrieved!",
      settings: { uid: settings.id, ...settings.data() },
    };
  } catch (error) {
    console.log(error);
    return {
      code: 500,
      success: false,
      message: "Error getting settings!",
      error: error,
    };
  }
};

export { saveSetting, getSettings };
