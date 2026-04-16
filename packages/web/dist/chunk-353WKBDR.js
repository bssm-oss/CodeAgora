// src/server/routes/notifications.ts
import { Hono } from "hono";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
var CA_ROOT = ".ca";
var NOTIFICATIONS_FILE = path.join(CA_ROOT, "notifications.json");
var MAX_NOTIFICATIONS = 100;
async function readNotifications() {
  try {
    const content = await readFile(NOTIFICATIONS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}
async function writeNotifications(notifications) {
  await mkdir(CA_ROOT, { recursive: true });
  await writeFile(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2), "utf-8");
}
async function createNotification(data) {
  const notification = {
    id: crypto.randomUUID(),
    ...data,
    read: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const notifications = await readNotifications();
  notifications.unshift(notification);
  const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
  await writeNotifications(trimmed);
  return notification;
}
var notificationRoutes = new Hono();
notificationRoutes.get("/", async (c) => {
  const notifications = await readNotifications();
  return c.json(notifications);
});
notificationRoutes.put("/:id/read", async (c) => {
  const { id } = c.req.param();
  const notifications = await readNotifications();
  const target = notifications.find((n) => n.id === id);
  if (!target) {
    return c.json({ error: "Notification not found" }, 404);
  }
  target.read = true;
  await writeNotifications(notifications);
  return c.json(target);
});
notificationRoutes.put("/read-all", async (c) => {
  const notifications = await readNotifications();
  for (const n of notifications) {
    n.read = true;
  }
  await writeNotifications(notifications);
  return c.json({ updated: notifications.length });
});

export {
  createNotification,
  notificationRoutes
};
