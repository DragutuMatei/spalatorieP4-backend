import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import {
  createBatch,
  getCollection,
  getCollectionWithScope,
} from "../utils/collections.js";
import { getIO } from "../utils/socket.js";

const BUCURESTI_TZ = "Europe/Bucharest";
const MAX_BATCH_SIZE = 450;
const IN_QUERY_LIMIT = 10;

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const parseBookingDate = (value) => {
  if (value === undefined || value === null) {
    return dayjs.invalid();
  }

  if (dayjs.isDayjs(value)) {
    return value.tz(BUCURESTI_TZ);
  }

  if (value instanceof Date || typeof value === "number") {
    return dayjs(value).tz(BUCURESTI_TZ);
  }

  if (typeof value === "object") {
    if (value.seconds !== undefined && value.nanoseconds !== undefined) {
      return dayjs
        .unix(value.seconds + value.nanoseconds / 1_000_000_000)
        .tz(BUCURESTI_TZ);
    }

    if (value._seconds !== undefined && value._nanoseconds !== undefined) {
      return dayjs
        .unix(value._seconds + value._nanoseconds / 1_000_000_000)
        .tz(BUCURESTI_TZ);
    }
  }

  if (typeof value === "string") {
    if (value.includes("T")) {
      const asUtc = dayjs.utc(value);
      return asUtc.isValid() ? asUtc.tz(BUCURESTI_TZ) : dayjs.invalid();
    }

    if (value.includes("/")) {
      return dayjs.tz(value, "DD/MM/YYYY", BUCURESTI_TZ);
    }

    if (value.includes("-")) {
      return dayjs.tz(value, "YYYY-MM-DD", BUCURESTI_TZ);
    }
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.tz(BUCURESTI_TZ) : dayjs.invalid();
};

const normalizeDateForComparison = (value) => {
  const parsed = parseBookingDate(value);
  return parsed.isValid() ? parsed.startOf("day").valueOf() : null;
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const extractStartTime = (source = {}) =>
  source.start_interval_time || source.startTime || source.start_interval || null;

const extractEndTime = (source = {}) =>
  source.final_interval_time || source.endTime || source.final_interval || null;

const extractBookingUserId = (bookingData = {}) =>
  bookingData.user?.uid || bookingData.user?.userId || bookingData.userId || null;

const extractNotificationUserId = (notificationData = {}) =>
  notificationData.userDetails?.userId || notificationData.userId || null;

const getNotificationDateValue = (notificationData = {}) =>
  normalizeDateForComparison(notificationData.date || notificationData.createdAt);

const addSnapshotRefs = (snapshot, notificationRefs) => {
  if (!snapshot) {
    return;
  }
  snapshot.forEach((doc) => {
    notificationRefs.set(doc.id, doc.ref);
  });
};

const buildBookingSummary = (booking) => {
  if (!booking || !booking.data) {
    return null;
  }

  const bookingData = booking.data;
  const userId = extractBookingUserId(bookingData);
  const dateValue = normalizeDateForComparison(bookingData.date);
  const start = extractStartTime(bookingData);
  const end = extractEndTime(bookingData);

  return {
    id: booking.id,
    ref: booking.ref,
    data: bookingData,
    userId,
    dateValue,
    start,
    end,
  };
};

const matchNotificationToBooking = (notificationData, bookingSummary) => {
  if (!notificationData || !bookingSummary) {
    return false;
  }

  if (
    notificationData.bookingId === bookingSummary.id ||
    notificationData.programareId === bookingSummary.id
  ) {
    return true;
  }

  const notificationUserId = extractNotificationUserId(notificationData);
  if (
    !bookingSummary.userId ||
    !notificationUserId ||
    notificationUserId !== bookingSummary.userId
  ) {
    return false;
  }

  if (bookingSummary.dateValue === null) {
    return false;
  }

  const notificationDateValue = getNotificationDateValue(notificationData);
  if (
    notificationDateValue === null ||
    notificationDateValue !== bookingSummary.dateValue
  ) {
    return false;
  }

  const notificationStart = notificationData.startTime || null;
  const notificationEnd = notificationData.endTime || null;

  if (
    !bookingSummary.start ||
    !bookingSummary.end ||
    !notificationStart ||
    !notificationEnd
  ) {
    return false;
  }

  return (
    bookingSummary.start === notificationStart &&
    bookingSummary.end === notificationEnd
  );
};

const deleteNotificationsLinkedToBookings = async (bookings, scope = "auto") => {
  if (!bookings.length) {
    return 0;
  }

  const notificationsCollection = getCollectionWithScope("notifications", scope);
  const notificationRefs = new Map();
  const notificationsByUserCache = new Map();

  const getCachedDocs = async (cache, key, queryBuilder) => {
    if (!key) {
      return [];
    }
    if (cache.has(key)) {
      return cache.get(key);
    }
    try {
      const docs = await queryBuilder();
      cache.set(key, docs);
      return docs;
    } catch (error) {
      cache.set(key, []);
      return [];
    }
  };

  const addMatchingDocs = (docs, bookingSummary) => {
    if (!Array.isArray(docs) || !docs.length) {
      return;
    }
    docs.forEach(({ id, ref, data }) => {
      if (!ref || notificationRefs.has(id)) {
        return;
      }
      if (!matchNotificationToBooking(data, bookingSummary)) {
        return;
      }
      notificationRefs.set(id, ref);
    });
  };

  const bookingSummaries = bookings
    .map((booking) => buildBookingSummary(booking))
    .filter(Boolean);

  const bookingIds = bookingSummaries.map((booking) => booking.id);

  for (const idChunk of chunkArray(bookingIds, IN_QUERY_LIMIT)) {
    try {
      const snapshot = await getCollection("notifications")
        .where("bookingId", "in", idChunk)
        .get();
      addSnapshotRefs(snapshot, notificationRefs);
    } catch (error) {
      console.warn(
        "[Cleanup] Unable to query notifications by bookingId chunk:",
        error
      );
    }

    try {
      const snapshot = await getCollection("notifications")
        .where("programareId", "in", idChunk)
        .get();
      addSnapshotRefs(snapshot, notificationRefs);
    } catch (error) {
      console.warn(
        "[Cleanup] Unable to query notifications by programareId chunk:",
        error
      );
    }
  }

  for (const bookingSummary of bookingSummaries) {
    if (!bookingSummary.userId) {
      continue;
    }

    try {
      const docs = await getCachedDocs(
        notificationsByUserCache,
        bookingSummary.userId,
        async () => {
          const [primarySnapshot, fallbackSnapshot] = await Promise.all([
            notificationsCollection
              .where("userDetails.userId", "==", bookingSummary.userId)
              .get(),
            notificationsCollection
              .where("userId", "==", bookingSummary.userId)
              .get(),
          ]);

          const mergedDocs = [
            ...primarySnapshot.docs,
            ...fallbackSnapshot.docs.filter(
              (doc) => !primarySnapshot.docs.some((existing) => existing.id === doc.id)
            ),
          ];

          return mergedDocs.map((doc) => ({
            id: doc.id,
            ref: doc.ref,
            data: doc.data() || {},
          }));
        }
      );

      addMatchingDocs(docs, bookingSummary);
    } catch (error) {
      console.warn(
        "[Cleanup] Unable to query notifications for user",
        bookingSummary.userId,
        error
      );
    }
  }

  const notificationRefsToDelete = Array.from(notificationRefs.values());

  for (const batchChunk of chunkArray(notificationRefsToDelete, MAX_BATCH_SIZE)) {
    const batch = createBatch();
    batchChunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  return notificationRefsToDelete.length;
};

const deleteProgramariOlderThanThreeDays = async (scope = "auto") => {
  const now = dayjs().tz(BUCURESTI_TZ);
  const cutoff = now.subtract(7, "day").endOf("day");

  try {
    const snapshot = await getCollectionWithScope("programari", scope).get();

    if (snapshot.empty) {
      return { deletedCount: 0, deletedNotifications: 0 };
    }

    const bookingsToDelete = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const bookingDate = parseBookingDate(data.date);

      if (!bookingDate.isValid()) {
        return;
      }

      if (bookingDate.endOf("day").isBefore(cutoff)) {
        bookingsToDelete.push({
          id: doc.id,
          ref: doc.ref,
          data,
        });
      }
    });

    if (!bookingsToDelete.length) {
      return { deletedCount: 0, deletedNotifications: 0 };
    }

    for (const chunk of chunkArray(bookingsToDelete, MAX_BATCH_SIZE)) {
      const batch = createBatch();
      chunk.forEach((booking) =>
        batch.delete(getCollectionWithScope("programari", scope).doc(booking.id))
      );
      await batch.commit();
    }

    const io = getIO();
    bookingsToDelete.forEach((booking) => {
      const programareId = booking.id;
      io.emit("programare", { action: "delete", programareId });
    });

    const deletedNotifications = await deleteNotificationsLinkedToBookings(
      bookingsToDelete,
      scope
    );

    return {
      deletedCount: bookingsToDelete.length,
      deletedNotifications,
    };
  } catch (error) {
    console.error("[Cleanup] Failed to delete old programari:", error);
    throw error;
  }
};

const scheduleNextCleanupRun = () => {
  const now = dayjs().tz(BUCURESTI_TZ);
  let nextRun = now.day(0).hour(3).minute(0).second(0).millisecond(0);

  if (now.isAfter(nextRun)) {
    nextRun = nextRun.add(1, "week");
  }

  let delay = nextRun.diff(now);

  if (delay <= 0) {
    delay = 60 * 1000;
  }

  setTimeout(async () => {
    try {
      const { deletedCount, deletedNotifications } =
        await deleteProgramariOlderThanThreeDays();
      console.log(
        `[Cleanup] Weekly purge executed. Removed ${deletedCount} bookings and ${deletedNotifications} related notifications older than 3 days.`
      );
    } catch (error) {
      console.error("[Cleanup] Error during scheduled purge:", error);
    } finally {
      scheduleNextCleanupRun();
    }
  }, delay);
};

const startWeeklyProgramariCleanup = () => {
  console.log("[Cleanup] Scheduling weekly cleanup for Sundays at 03:00 Europe/Bucharest.");
  scheduleNextCleanupRun();
};

export { startWeeklyProgramariCleanup, deleteProgramariOlderThanThreeDays };
