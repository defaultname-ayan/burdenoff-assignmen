let businessDayMinutes = 540;

export function setBusinessDayMinutes(minutes: number): void {
  if (Number.isFinite(minutes) && minutes > 0) businessDayMinutes = minutes;
}

export function getBusinessDayMinutes(): number {
  return businessDayMinutes;
}
