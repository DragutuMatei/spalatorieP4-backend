import { getCollection } from "../utils/collections.js";

const saveSetting = async (key, value) => {
  try {
    console.log(`Saving setting: ${key} = ${value}`);
    const settingsRef = getCollection("settings").doc("availability");
    await settingsRef.set({ [key]: value }, { merge: true });
    const saveDoc = await settingsRef.get();
    const settingsData = saveDoc.data() || {};

    if (settingsData.dryer2Enabled === undefined) {
      settingsData.dryer2Enabled = true;
    }

    if (settingsData.blockPastSlots === undefined) {
      settingsData.blockPastSlots = false;
    }

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
    const settingsRef = getCollection("settings").doc("availability");
    const settings = await settingsRef.get();
    if (!settings.exists) {
      // Creez setările default dacă nu există
      const defaultSettings = {
        dryerEnabled: true,
        dryer2Enabled: true,
        m1Enabled: true,
        m2Enabled: true,
        blockPastSlots: false,
      };
      await settingsRef.set(defaultSettings);
      return {
        code: 200,
        success: true,
        message: "Default settings created!",
        settings: { uid: settings.id, ...defaultSettings },
      };
    }
    const data = settings.data() || {};

    let settingsData = { uid: settings.id, ...data };

    let needsUpdate = false;
    const updates = {};

    if (settingsData.dryer2Enabled === undefined) {
      updates.dryer2Enabled = true;
      settingsData.dryer2Enabled = true;
      needsUpdate = true;
    }

    if (settingsData.blockPastSlots === undefined) {
      updates.blockPastSlots = false;
      settingsData.blockPastSlots = false;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await settingsRef.set(updates, { merge: true });
    }

    return {
      code: 200,
      success: true,
      message: "Settings retrieved!",
      settings: settingsData,
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
