"use client";

import { useEffect, useRef, useState } from "react";
import { readStoredValue, storageKeys, writeStoredValue } from "./storage";
import { studyBlockScheduledStart } from "./studyProgress";
import type { StudyBlock } from "@/types";

export const NOTIFY_MINUTES_BEFORE = 15;

export function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission {
  return isNotificationSupported() ? Notification.permission : "denied";
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  return Notification.requestPermission();
}

export function readNotificationsEnabled() {
  return readStoredValue<boolean>(storageKeys.notificationsEnabled, false);
}

export function writeNotificationsEnabled(enabled: boolean) {
  writeStoredValue(storageKeys.notificationsEnabled, enabled);
}

/**
 * A session "comes due" once it is within the reminder window and hasn't
 * started yet - already-started/completed sessions are excluded so a missed
 * check (e.g. the tab was closed) never fires a stale reminder late.
 */
export function findBlocksDueForNotification(blocks: StudyBlock[], now: Date, alreadyNotifiedIds: Set<string>): StudyBlock[] {
  const windowEnd = now.getTime() + NOTIFY_MINUTES_BEFORE * 60 * 1000;

  return blocks.filter((block) => {
    if (block.completedAt || alreadyNotifiedIds.has(block.id)) return false;
    const startMs = studyBlockScheduledStart(block).getTime();
    return startMs >= now.getTime() && startMs <= windowEnd;
  });
}

/**
 * Polls localStorage (rather than taking studyBlocks as a prop) so it works
 * the same regardless of which page/workspace is currently mounted - this
 * only fires while a PlanAround tab is open, since there is no service
 * worker/push subscription behind it.
 */
export function useStudySessionNotifications() {
  const [enabled, setEnabled] = useState(false);
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setEnabled(readNotificationsEnabled() && getNotificationPermission() === "granted");
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function check() {
      const blocks = readStoredValue<StudyBlock[]>(storageKeys.studyBlocks, []);
      const due = findBlocksDueForNotification(blocks, new Date(), notifiedIds.current);
      due.forEach((block) => {
        notifiedIds.current.add(block.id);
        new Notification("Study session starting soon", {
          body: `${block.taskName} - ${block.start}–${block.end}`,
          tag: block.id,
        });
      });
    }

    check();
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, [enabled]);
}
