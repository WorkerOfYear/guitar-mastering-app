// Calendar days in the device's time zone, as YYYY-MM-DD strings (they sort and compare as text).

export const localDate = (d: Date | number = new Date()) => new Date(d).toLocaleDateString("en-CA");

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (day: string, n: number) => {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return localDate(d);
};

export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

/** Monday of the week that contains `day`. */
export const weekStart = (day: string) => addDays(day, -((parse(day).getDay() + 6) % 7));

export const weekday = (day: string) => parse(day).getDay(); // 0 = Sunday

export const formatDay = (day: string) =>
  parse(day).toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" });
