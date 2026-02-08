import { db } from "./admin_fire.js";

const getCollectionName = (baseName = "") => {
  if (!baseName || typeof baseName !== "string") {
    throw new Error("Base collection name must be a non-empty string");
  }
  return baseName;
};

const getDb = () => db;

const createBatch = () => db.batch();

const getCollection = (baseName) => db.collection(getCollectionName(baseName));

const getCollectionWithScope = (baseName, scope = "auto") => {
  if (!baseName || typeof baseName !== "string") {
    throw new Error("Base collection name must be a non-empty string");
  }
  return getCollection(baseName);
};

export {
  getCollection,
  getCollectionName,
  getDb,
  createBatch,
  getCollectionWithScope,
};
