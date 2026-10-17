import { getCollection } from "../utils/collections.js";

// Câte zile în avans (fără ziua curentă) se pot programa userii cu rol "user"
const DEFAULT_MAX_BOOKING_DAYS_AHEAD = 21;
const MAX_BOOKING_DAYS_AHEAD_LIMIT = 365;

const saveSetting = async (key, value) => {
  try {
    console.log(`Saving setting: ${key} = ${value}`);
    const settingsRef = getCollection("settings").doc("availability");
    await settingsRef.set({ [key]: value }, { merge: true });
    const saveDoc = await settingsRef.get();
    const settingsData = saveDoc.data() || {};

    if (settingsData.m3Enabled === undefined) {
      settingsData.m3Enabled = true;
    }

    if (settingsData.blockPastSlots === undefined) {
      settingsData.blockPastSlots = false;
    }

    if (settingsData.maxBookingDaysAhead === undefined) {
      settingsData.maxBookingDaysAhead = DEFAULT_MAX_BOOKING_DAYS_AHEAD;
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
        m1Enabled: true,
        m2Enabled: true,
        m3Enabled: true,
        blockPastSlots: false,
        maxBookingDaysAhead: DEFAULT_MAX_BOOKING_DAYS_AHEAD,
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

    if (settingsData.m3Enabled === undefined) {
      updates.m3Enabled = true;
      settingsData.m3Enabled = true;
      needsUpdate = true;
    }

    if (settingsData.blockPastSlots === undefined) {
      updates.blockPastSlots = false;
      settingsData.blockPastSlots = false;
      needsUpdate = true;
    }

    if (settingsData.maxBookingDaysAhead === undefined) {
      updates.maxBookingDaysAhead = DEFAULT_MAX_BOOKING_DAYS_AHEAD;
      settingsData.maxBookingDaysAhead = DEFAULT_MAX_BOOKING_DAYS_AHEAD;
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

const getMaxBookingDaysAhead = async () => {
  try {
    const settingsDoc = await getCollection("settings").doc("availability").get();
    const value = settingsDoc.exists
      ? settingsDoc.data()?.maxBookingDaysAhead
      : undefined;
    return Number.isInteger(value) ? value : DEFAULT_MAX_BOOKING_DAYS_AHEAD;
  } catch (error) {
    console.error("Error reading maxBookingDaysAhead:", error);
    return DEFAULT_MAX_BOOKING_DAYS_AHEAD;
  }
};

export {
  saveSetting,
  getSettings,
  getMaxBookingDaysAhead,
  DEFAULT_MAX_BOOKING_DAYS_AHEAD,
  MAX_BOOKING_DAYS_AHEAD_LIMIT,
};
