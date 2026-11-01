// Whether this browser has finished the onboarding quiz. Mirrors the mobile app, which keeps the same flag per device.
const KEY = "wayfare.onboarded";

export function isOnboardedLocally() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setOnboardedLocally(done: boolean) {
  try {
    if (done) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the quiz just shows again next visit.
  }
}

/** DEV MODE has one shared, already-onboarded test user, so the quiz is tracked per browser; otherwise per account. */
export const needsOnboarding = (devMode: boolean | undefined, onboarded: boolean | undefined) => (devMode ? !isOnboardedLocally() : onboarded === false);
